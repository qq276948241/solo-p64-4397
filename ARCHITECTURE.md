# 宠物美容店预约管理系统 - 架构文档

> 新同事入职速查版：30 分钟搞懂项目全貌

---

## 一、技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 运行时 | Node.js 18+ | |
| Web 框架 | Express 4 | 轻量级，够用 |
| 数据库 | SQLite 3 | 单文件零配置，存在 `data/pet-grooming.db` |
| 鉴权 | JWT (jsonwebtoken) | 无状态 Token |
| 密码加密 | bcryptjs | 加盐哈希 |
| 跨域 | cors | 开发阶段全放开 |

---

## 二、目录划分

```
project64/
├── app.js                      # 应用入口：注册中间件、挂路由、启动服务器
├── package.json
│
├── config/
│   └── index.js                # 全局配置：端口、JWT密钥、会员等级规则、时长限制
│
├── db/
│   └── index.js                # SQLite 连接封装 + Promise API（query/queryOne/execute）
│
├── middleware/
│   ├── auth.js                 # JWT 鉴权中间件 + Token 生成函数
│   └── validate.js             # 参数校验中间件（预约/照片，解耦路由逻辑）
│
├── services/
│   └── memberService.js        # 会员核心业务：等级判定/折扣/累计消费升级/下一等级
│
├── routes/                     # 路由层（只做 HTTP 编解码 + 调用 service/DB，不写复杂逻辑）
│   ├── auth.js                 # 注册/登录/个人信息
│   ├── pets.js                 # 宠物档案 CRUD
│   ├── appointments.js         # 预约下单/取消/状态流转
│   ├── serviceRecords.js       # 服务记录/照片/消费累计
│   ├── members.js              # 会员等级查询（含我的/列表/详情）
│   └── base.js                 # 基础数据：美容师列表/排班、服务项目
│
├── utils/
│   ├── errorCodes.js           # 统一错误码表（按模块分号段，见下文）
│   └── response.js             # success() / fail() 标准化 JSON 响应
│
├── scripts/
│   └── init-db.js              # 建表 + 初始化默认账号/美容师/服务项目
│
└── data/
    └── pet-grooming.db         # SQLite 数据文件（启动时自动创建）
```

### 目录职责原则

- **路由层 (`routes/`)**：只做三件事 —— 1) 取参数 2) 调 DB/Service 3) 返回 JSON。不写业务规则。
- **中间件 (`middleware/`)**：横切关注点（鉴权、参数校验）放在这里，路由里只写 `authMiddleware()` 和 `validateAppointment` 这种声明式调用。
- **服务层 (`services/`)**：可复用、可单独测试的纯业务逻辑（比如"满200升银卡"这种规则，绝对不能写在路由里）。
- **工具层 (`utils/`)**：无副作用的纯函数或常量。
- **DB 层 (`db/`)**：只做 SQL 封装，不带业务判断。

---

## 三、四大业务模块

### 模块 1：宠物档案 (`/api/pets`)

**作用**：登记每只宠物的基础信息。

| 字段 | 说明 |
|---|---|
| name | 宠物名字（必填） |
| breed | 品种 |
| weight | 体重（kg） |
| vaccine_status | 疫苗情况（如"已接种三联"） |
| notes | 备注 |
| owner_id | 所属顾客用户 ID（外键 → users.id） |

**权限**：顾客只能看/改/删自己的宠物；管理员和店员能看全部。

**接口**：`POST / GET / PUT / DELETE /api/pets[/:id]` 标准 CRUD。

---

### 模块 2：预约下单 (`/api/appointments`)

**作用**：顾客选宠物+美容师+服务+时段，生成一条预约。

| 字段 | 说明 |
|---|---|
| customer_id, pet_id, groomer_id, service_id | 四张外键 |
| appointment_date, appointment_time | 日期(YYYY-MM-DD) + 时间(HH:MM，以0或30分结尾) |
| status | 状态：待服务 / 服务中 / 已完成 / 已取消 |
| cancel_reason | 取消原因 |
| remark | 顾客特殊备注（如"怕吹风机"、"剪短点"） |

**核心业务规则**：
1. **排班冲突**：同一美容师同一时段已有"非已取消"预约 → 拒绝（错误码 40003）
2. **时间校验**：预约时间不能早于当前（错误码 40007）
3. **备注长度**：最多 200 字（错误码 40008）
4. **取消权限**：顾客只能取消自己的预约；服务中/已完成的不能取消

**校验中间件**：所有参数校验在 [middleware/validate.js](file:///d:/code/ai-prompt/solo-chrome-dev-F12/repos/repo64/project64/middleware/validate.js) 的 `validateAppointment` 中统一处理。

---

### 模块 3：服务记录 (`/api/service-records`)

**作用**：服务结束后店员填写实际执行情况。

| 字段 | 说明 |
|---|---|
| appointment_id | 对应预约（唯一外键，一条预约只能生成一条记录） |
| pet_behavior | 宠物表现（如"很乖，配合度高"） |
| supplies_used | 用品消耗（如"进口洗发水×1"） |
| original_amount, discount_amount, final_amount | 原价 / 折扣金额 / 实收金额 |
| staff_notes | 店员备注 |
| photos | 最多 3 张照片 URL（存在 `service_photos` 表，一对多） |

**核心业务规则**：
1. 必须是店员/管理员才能创建
2. **照片数量限制**：最多 3 张（错误码 50003），由 `validatePhotos` 中间件统一校验
3. 创建服务记录采用**数据库事务**：
   ```
   插入 service_records → 插入多张 service_photos → 更新 appointment.status=已完成 → 累计消费+升级会员
   ```
   任何一步失败都会 ROLLBACK，保证数据一致性
4. 折扣金额由 [memberService.js](file:///d:/code/ai-prompt/solo-chrome-dev-F12/repos/repo64/project64/services/memberService.js) 的 `calcDiscountedPrice()` 统一计算

**顾客备注回显**：服务记录的列表和详情接口会自动带上关联预约的 `remark` 字段，方便店员查看顾客特殊要求。

---

### 模块 4：会员等级 (`/api/members`)

**作用**：基于累计消费自动升降级，服务时享受对应折扣。

| 等级 Key | 名称 | 累计消费门槛 | 折扣 |
|---|---|---|---|
| `NORMAL` | 普通会员 | ¥0 | 100% |
| `SILVER` | 银卡会员 | ¥200 | 90% |
| `GOLD` | 金卡会员 | ¥500 | 85% |

**核心业务规则（全部封装在 memberService 中）**：

| 函数 | 作用 |
|---|---|
| `getLevelBySpend(totalSpent)` | 根据累计消费算等级（整数分比较，防浮点误差） |
| `getDiscount(level)` | 取对应折扣系数 |
| `getNextLevel(totalSpent)` | 下一级还差多少钱（已最高级返回 null） |
| `calcDiscountedPrice(originalPrice, level)` | 统一算原价/折扣价/折扣金额 |
| `addSpendAndUpgrade(userId, amount)` | 累计消费 + 自动升级，**服务记录创建时调用** |
| `getMemberInfo(userId)` | 取完整会员信息（含 level_info、discount） |

**浮点精度陷阱**：金额在比较/累加前一律用 `toCents()` 转整数分（如 ¥200 → 20000 分），计算完再 `fromCents()` 转回去。彻底消除 `0.1+0.2=0.30000000000000004` 这种边界 bug。

---

## 四、数据库表结构 & 外键关系

```
┌─────────────┐       ┌──────────────────┐
│    users    │       │     members      │
│─────────────│       │──────────────────│
│ id (PK)     │1─────1│ user_id (PK,FK)  │
│ username    │       │ level            │
│ password    │       │ total_spent      │
│ role        │       └──────────────────┘
│ name        │
│ phone       │
└──────┬──────┘
       │ 1
       │
       │ N
┌──────┴──────┐       ┌──────────────────┐       ┌───────────────┐
│    pets     │       │   appointments   │       │  groomers     │
│─────────────│       │──────────────────│       │───────────────│
│ id (PK)     │1─────N│ id (PK)          │N─────1│ id (PK)       │
│ owner_id FK │       │ customer_id  FK  │       │ name          │
│ name        │       │ pet_id       FK  │       │ phone         │
│ breed       │       │ groomer_id   FK  │       │ description   │
│ weight      │       │ service_id   FK  │       └───────────────┘
│ vaccine_st  │       │ appointment_date │
│ notes       │       │ appointment_time │
└─────────────┘       │ status           │       ┌───────────────┐
                      │ cancel_reason    │       │  services     │
                      │ remark           │N─────1│───────────────│
                      └──────┬───────────┘       │ id (PK)       │
                             │ 1                 │ name          │
                             │                   │ price         │
                             │ N                 │ duration      │
                  ┌──────────┴───────────┐       │ description   │
                  │  service_records     │       └───────────────┘
                  │──────────────────────│
                  │ id (PK)              │
                  │ appointment_id (FK)  │1
                  │ pet_behavior         │
                  │ supplies_used        │
                  │ original_amount      │
                  │ discount_amount      │
                  │ final_amount         │
                  │ staff_notes          │
                  └──────────┬───────────┘
                             │ 1
                             │
                             │ N
                  ┌──────────┴───────────┐
                  │   service_photos     │
                  │──────────────────────│
                  │ id (PK)              │
                  │ record_id (FK)       │
                  │ photo_url            │
                  └──────────────────────┘
```

### 外键约束说明

所有外键都带 `ON DELETE CASCADE`，比如：
- 删用户 → 自动删其宠物、预约、会员
- 删宠物 → 不影响预约/服务记录（实际用了 RESTRICT，但这里全部 CASCADE，由业务层做存在性校验）
- 删预约 → 自动删其服务记录和照片
- 删服务记录 → 自动删其照片

### 启动时字段升级

在 [db/index.js](file:///d:/code/ai-prompt/solo-chrome-dev-F12/repos/repo64/project64/db/index.js) 启动时会执行 `ALTER TABLE ... ADD COLUMN ...` 静默失败（字段已存在不报错）。新增字段直接加在这里即可兼容老库，不用手动改 SQLite。

---

## 五、JWT 鉴权流程

### 5.1 登录拿 Token

```
客户端                          服务器
  │  POST /api/auth/login          │
  │  { username, password }        │
  │ ─────────────────────────────> │
  │                                │ bcrypt.compareSync(密码哈希)
  │                                │ ↓
  │                                │ jwt.sign({id, role, name}, secret, {expiresIn:'7d'})
  │                                │ ↓
  │  { code:0, data:{ token, user, member } }
  │ <───────────────────────────── │
```

### 5.2 携带 Token 访问受保护接口

```
客户端                                服务器
  │  GET /api/pets                        │
  │  Header: Authorization: Bearer <token>│
  │ ────────────────────────────────────> │
  │                                       │
  │                          authMiddleware()
  │                          ├─ 解析 Bearer Token
  │                          ├─ jwt.verify(签名校验)
  │                          ├─ 解析出 req.user = {id, username, role, name}
  │                          └─ 若指定了 requiredRoles，检查 req.user.role 是否在白名单
  │                                       │
  │                                       │ 路由 handler (拿到 req.user 就能用了)
  │  { code:0, data:[...] }               │
  │ <──────────────────────────────────── │
```

### 5.3 角色权限矩阵

| 角色 | 能做什么 |
|---|---|
| `admin` / `staff` | 查所有数据、创建服务记录、改预约状态、看会员列表 |
| `customer` | 只看自己的宠物/预约/服务记录/会员，下预约，取消自己的预约，创建宠物 |

路由里声明式地写：
```js
router.post('/', authMiddleware(['customer']), validateAppointment, handler);
// 只有顾客能创建预约

router.put('/:id/status', authMiddleware(['admin', 'staff']), handler);
// 只有店员/管理员能改预约状态
```

### 5.4 Token 过期/失效

| 错误码 | 含义 | HTTP 状态码 |
|---|---|---|
| 10002 | Token 缺失或格式错（没带 Bearer） | 401 |
| 10003 | Token 已过期 | 401 |
| 10004 | 角色不在白名单 | 403 |

---

## 六、统一错误码规范

响应格式永远是：
```json
{ "code": 40008, "message": "备注长度不能超过200字", "data": null }
```

成功时 `code: 0`，失败按模块分号段：

| 号段 | 模块 | 示例 |
|---|---|---|
| `1xxxx` | 通用 | 10001 参数错 / 10002 未授权 / 10004 无权限 / 10005 不存在 |
| `2xxxx` | 用户 | 20001 用户不存在 / 20002 用户名已存在 / 20003 密码错 |
| `3xxxx` | 宠物 | 30001 宠物不存在 / 30002 不是主人 |
| `4xxxx` | 预约 | 40001 美容师不存在 / 40003 排班冲突 / 40007 时间无效 / **40008 备注过长** |
| `5xxxx` | 服务记录 | 50001 记录不存在 / 50002 已存在记录 / **50003 照片超3张** |
| `6xxxx` | 会员 | 60001 会员信息不存在 |
| `9xxxx` | 系统 | 90001 数据库错误 / 99999 未知错误 |

所有错误码定义在 [utils/errorCodes.js](file:///d:/code/ai-prompt/solo-chrome-dev-F12/repos/repo64/project64/utils/errorCodes.js)，加新错误直接在里面加条目，路由里用 `fail(res, getError('REMARK_TOO_LONG'))` 调用。

---

## 七、本地开发流程

### 首次启动

```bash
npm install
npm start          # 自动建库 + 初始化默认账号
```

启动后访问 `http://localhost:3000/` 能看到所有接口清单。

### 默认账号

| 角色 | 用户名 | 密码 |
|---|---|---|
| 管理员 | admin | admin123 |
| 店员 | staff | staff123 |
| 顾客 | customer | customer123 |

### 调试一个接口

1. 先调 `/api/auth/login` 拿 token
2. 后续请求加 Header：`Authorization: Bearer <token>`
3. 用 curl / Postman / VS Code REST Client 都行

### 新增字段的 3 步标准流程

以本次加 `remark` 字段为例：

1. **建表 SQL**（`scripts/init-db.js`）：在 CREATE TABLE 里加字段，新库生效
2. **兼容老库**（`db/index.js`）：启动时 `ALTER TABLE xxx ADD COLUMN yyy`，静默报错
3. **路由/中间件**：读写该字段 + 加校验规则

不要跳第 2 步！否则已有数据的库会报错。

---

## 八、代码阅读顺序建议（新同事路线）

1. `utils/errorCodes.js` + `utils/response.js` → 知道接口返回长啥样
2. `middleware/auth.js` → 搞懂鉴权怎么来的
3. `config/index.js` → 所有可调的常量在这里
4. `routes/auth.js` → 最简单的路由，看路由层写法范式
5. `services/memberService.js` → 看"业务逻辑怎么下沉到 service"
6. `middleware/validate.js` → 看"参数校验怎么下沉到中间件"
7. `routes/appointments.js` → 综合案例（校验+鉴权+DB+权限）
8. `routes/serviceRecords.js` → 进阶案例（数据库事务 + 跨模块调用 memberService）

看完这 8 个文件就能独立写新功能了。
