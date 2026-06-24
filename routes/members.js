const express = require('express');
const { query } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { getError } = require('../utils/errorCodes');
const { success, fail } = require('../utils/response');
const { getMemberInfo, getDiscount } = require('../services/memberService');
const config = require('../config');

const router = express.Router();

router.get('/me', authMiddleware(), async (req, res) => {
  try {
    const member = await getMemberInfo(req.user.id);
    return success(res, member);
  } catch (err) {
    console.error(err);
    if (err.code === 60001) {
      return fail(res, err, 404);
    }
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

router.get('/', authMiddleware(['admin', 'staff']), async (req, res) => {
  try {
    const { level, keyword } = req.query;
    let sql = `SELECT m.*, u.name, u.phone, u.username, u.created_at as user_created_at
               FROM members m JOIN users u ON m.user_id = u.id WHERE 1=1`;
    const params = [];

    if (level) {
      sql += ' AND m.level = ?';
      params.push(level);
    }
    if (keyword) {
      sql += ' AND (u.name LIKE ? OR u.phone LIKE ? OR u.username LIKE ?)';
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw);
    }
    sql += ' ORDER BY m.total_spent DESC';

    let members = await query(sql, params);
    members = members.map(m => ({
      ...m,
      level_info: config.memberLevels[m.level],
      discount: getDiscount(m.level),
      next_level: getNextLevel(m.total_spent)
    }));

    return success(res, members);
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

router.get('/levels', authMiddleware(), async (req, res) => {
  try {
    const levels = Object.entries(config.memberLevels).map(([key, value]) => ({
      key,
      ...value
    }));
    return success(res, levels);
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

router.get('/:userId', authMiddleware(['admin', 'staff']), async (req, res) => {
  try {
    const member = await getMemberInfo(req.params.userId);
    member.next_level = getNextLevel(member.total_spent);

    const records = await query(
      `SELECT sr.final_amount, sr.created_at, s.name as service_name, a.appointment_date
       FROM service_records sr
       JOIN appointments a ON sr.appointment_id = a.id
       JOIN services s ON a.service_id = s.id
       WHERE a.customer_id = ?
       ORDER BY sr.created_at DESC
       LIMIT 20`,
      [req.params.userId]
    );
    member.recent_consumptions = records;

    return success(res, member);
  } catch (err) {
    console.error(err);
    if (err.code === 60001) {
      return fail(res, err, 404);
    }
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

function getNextLevel(totalSpent) {
  const levels = Object.entries(config.memberLevels)
    .sort((a, b) => b[1].minSpend - a[1].minSpend);

  let nextLevel = null;
  for (let i = levels.length - 1; i >= 0; i--) {
    if (totalSpent < levels[i][1].minSpend) {
      nextLevel = {
        key: levels[i][0],
        name: levels[i][1].name,
        minSpend: levels[i][1].minSpend,
        discount: levels[i][1].discount,
        amountToReach: Number((levels[i][1].minSpend - totalSpent).toFixed(2))
      };
      break;
    }
  }
  return nextLevel;
}

module.exports = router;
