# 教培三端工作台

面向中小教培机构的三端工作台：**校长端 / 教师端 / 学管端**，移动端优先，可安装到手机主屏幕当 App 用（PWA）。

## 线上地址

| 部署 | 入口 |
|---|---|
| GitHub Pages（本仓库） | `https://shuijinlens-cpu.github.io/<仓库名>/` |
| WorkBuddy 云端同步版 | https://workbuddy.link/p/us0ctJ1TEtOw2Lhbz8rlIQ |

> GitHub Pages 版数据存本机浏览器（localStorage），同一设备三端互通；多设备云端实时同步请用 WorkBuddy 版（需浏览器登录 WorkBuddy 账号）。

## 文件说明

| 文件 | 说明 |
|---|---|
| `index.html` | 三合一入口页 |
| `gh-principal.html` / `gh-teacher.html` / `gh-xueguan.html` | 校长端 / 教师端 / 学管端（GitHub Pages 版） |
| `principal.html` / `teacher.html` / `xueguan.html` | 三端源码（WorkBuddy 云端版，入口名不同） |
| `manifest-gh-*.webmanifest` | PWA 清单（安装到主屏幕用） |
| `sw-gh-*.js` | Service Worker（离线缓存） |
| `icon.svg` | 应用图标 |
| `test_cloud.js` | 端到端回归测试（`node test_cloud.js`） |

## 登录账号（初始登录码，登录后请修改）

| 姓名 | 登录码 | 身份 |
|---|---|---|
| 张校长 | 888888 | 校长 |
| 王老师 | 111111 | 老师 |
| 李老师 | 222222 | 老师 |
| 小学管 | 333333 | 学管 |

教师端按登录账号只显示本人数据，无切换入口。

## 功能一览

- **校长端**：经营看板、学员档案（年级×班型定价矩阵、正课次数、福利体系）、排课、收支/退费、教师工资核算（max 封顶 + 回本线）、添加教师时一并开通账号、账号管理
- **教师端**：只看自己的课表、打卡自动扣课时并联动学员剩余、学员跟进记录、待办任务、课后反馈语料
- **学管端**：课消与剩余查询、续费/到期提醒、跟进协作记录、代打卡与回访

## 本地部署方式

GitHub Pages：仓库 Settings → Pages → Source 选 `main` 分支 `/` 根目录，保存后约 1 分钟生效。
