const express = require('express');
const bcrypt = require('bcryptjs');
const { queryOne, execute } = require('../db');
const { generateToken, authMiddleware } = require('../middleware/auth');
const { getError } = require('../utils/errorCodes');
const { success, fail } = require('../utils/response');
const { getMemberInfo } = require('../services/memberService');

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { username, password, name, phone } = req.body;
    if (!username || !password || !name) {
      return fail(res, getError('PARAM_ERROR', '用户名、密码、姓名不能为空'));
    }
    if (password.length < 6) {
      return fail(res, getError('PARAM_ERROR', '密码长度不能少于6位'));
    }

    const existing = await queryOne('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
      return fail(res, getError('USER_EXISTS'));
    }

    const hashedPwd = bcrypt.hashSync(password, 10);
    const result = await execute(
      'INSERT INTO users (username, password, role, name, phone) VALUES (?, ?, ?, ?, ?)',
      [username, hashedPwd, 'customer', name, phone || null]
    );

    await execute(
      'INSERT INTO members (user_id, level, total_spent) VALUES (?, ?, ?)',
      [result.lastID, 'NORMAL', 0]
    );

    return success(res, { userId: result.lastID }, '注册成功');
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return fail(res, getError('PARAM_ERROR', '用户名和密码不能为空'));
    }

    const user = await queryOne('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return fail(res, getError('USER_NOT_FOUND'));
    }

    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) {
      return fail(res, getError('WRONG_PASSWORD'));
    }

    const token = generateToken(user);
    const member = await getMemberInfo(user.id);

    return success(res, {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name,
        phone: user.phone
      },
      member
    }, '登录成功');
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

router.get('/profile', authMiddleware(), async (req, res) => {
  try {
    const user = await queryOne(
      'SELECT id, username, role, name, phone, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) {
      return fail(res, getError('USER_NOT_FOUND'), 404);
    }
    const member = await getMemberInfo(user.id);
    return success(res, { user, member });
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

module.exports = router;
