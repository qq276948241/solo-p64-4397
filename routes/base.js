const express = require('express');
const { query, queryOne } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { getError } = require('../utils/errorCodes');
const { success, fail } = require('../utils/response');

const router = express.Router();

router.get('/groomers', authMiddleware(), async (req, res) => {
  try {
    const groomers = await query('SELECT * FROM groomers ORDER BY id');
    return success(res, groomers);
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

router.get('/groomers/:id/schedule', authMiddleware(), async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return fail(res, getError('PARAM_ERROR', '请指定日期参数 date (YYYY-MM-DD)'));
    }

    const appointments = await query(
      `SELECT id, appointment_time, status, service_id 
       FROM appointments 
       WHERE groomer_id = ? AND appointment_date = ? AND status != '已取消'`,
      [req.params.id, date]
    );

    const takenSlots = appointments.map(a => a.appointment_time);
    return success(res, { taken_slots: takenSlots, appointments });
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

router.get('/services', authMiddleware(), async (req, res) => {
  try {
    const services = await query('SELECT * FROM services ORDER BY id');
    return success(res, services);
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

module.exports = router;
