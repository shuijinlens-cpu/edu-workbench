#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""import_page2.py —— 按新契约（confirmKey/taskId + headers）导入页面 ZIP 到资料库"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

_LIB_DIR = Path("E:/软件安装/WorkBuddy/resources/app.asar.unpacked/resources/plugins/workbuddy-builtin/skills/library")
if str(_LIB_DIR) not in sys.path:
    sys.path.insert(0, str(_LIB_DIR))

from _common import http_request, unwrap_data, HttpError  # noqa: E402

_PATH_GET_UPLOAD_CREDENTIAL = "/space/api/agent/v1/get-upload-credential"
_PATH_IMPORT_LOCAL_FILE = "/space/api/agent/v1/import-local-file"
PUT_TIMEOUT = 120.0


def error_exit(msg: str) -> None:
    print(json.dumps({"error": msg}, ensure_ascii=False))
    sys.exit(1)


def put_with_headers(upload_url: str, headers: dict, body: bytes) -> bool:
    req = urllib.request.Request(url=upload_url, data=body, method="PUT")
    for k, v in headers.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=PUT_TIMEOUT) as resp:
            return 200 <= resp.status < 300
    except Exception:
        return False


def main() -> None:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("path")
    parser.add_argument("--file-name", dest="file_name", default="")
    parser.add_argument("--space-id", dest="space_id", default="")
    parser.add_argument("--parent-id", dest="parent_id", default="")
    parser.add_argument("--node-block-id", dest="node_block_id", default="")
    parser.add_argument("--databases", default="")
    args = parser.parse_args()

    path = Path(args.path)
    if not path.is_file():
        error_exit("文件不存在: " + str(path))
    content = path.read_bytes()
    size = len(content)
    file_name = (args.file_name or path.name).strip()

    target_space_id = (args.space_id or "").strip()
    target_parent_id = (args.parent_id or "").strip()
    existing_node_block_id = (args.node_block_id or "").strip()

    database_ref = []
    if args.databases:
        try:
            parsed = json.loads(args.databases)
        except json.JSONDecodeError:
            error_exit("databases JSON 格式非法")
        if not isinstance(parsed, list):
            error_exit("databases 必须是 JSON 数组")
        for item in parsed:
            if not isinstance(item, dict) or not item.get("id"):
                error_exit("databases 每一项都必须包含 id")
            database_ref.append({"id": item["id"]})

    # ---- Step 1: 上传凭证 ----
    cred_body = {"fileName": file_name, "fileSize": size}
    if target_parent_id or target_space_id:
        cred_body["parentId"] = target_parent_id or target_space_id
    try:
        cred_data = unwrap_data(
            http_request("POST", _PATH_GET_UPLOAD_CREDENTIAL, body=cred_body, timeout=8.0)
        )
    except HttpError as e:
        error_exit(f"获取上传凭证失败: {e}")

    upload_url = (cred_data.get("uploadUrl") or "").strip()
    upload_headers = cred_data.get("headers")
    confirm_key = (cred_data.get("confirmKey") or "").strip()
    task_id = (cred_data.get("taskId") or "").strip()
    if not upload_url or not isinstance(upload_headers, dict) or not upload_headers or not confirm_key:
        error_exit("上传凭证不完整（缺 uploadUrl/headers/confirmKey）")

    # ---- Step 2: PUT 直传 ----
    if not put_with_headers(upload_url, upload_headers, content):
        error_exit("文件上传到 COS 失败")

    # ---- Step 3: 触发导入 ----
    import_body = {
        "confirmKey": confirm_key,
        "fileName": file_name,
        "fileSize": size,
    }
    if task_id:
        import_body["taskId"] = task_id
    if target_space_id:
        import_body["spaceId"] = target_space_id
    if target_parent_id:
        import_body["parentId"] = target_parent_id
    if existing_node_block_id:
        import_body["nodeBlockId"] = existing_node_block_id
    if database_ref:
        import_body["databaseRef"] = database_ref
    title = os.path.splitext(file_name)[0].strip()
    if title:
        import_body["title"] = title

    try:
        import_data = unwrap_data(
            http_request("POST", _PATH_IMPORT_LOCAL_FILE, body=import_body, timeout=30.0)
        )
    except HttpError as e:
        error_exit(f"导入文件请求失败: {e}")

    node_block_id = (import_data.get("nodeBlockId") or "").strip()
    if not node_block_id:
        error_exit("服务端返回的 nodeBlockId 为空")
    url = (import_data.get("url") or "").strip()
    publish_url = (import_data.get("publishUrl") or "").strip()
    print("KS_IMPORT_OK " + json.dumps({
        "node_block_id": node_block_id,
        "file_name": file_name,
        "url": url,
        "publish_url": publish_url,
    }, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
