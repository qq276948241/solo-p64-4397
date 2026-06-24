const express = require('express');
const { query, queryOne, execute } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { getError } = require('../utils/errorCodes');
const { success, fail } = require('../utils/response');
const { getDiscount, getMemberInfo } = require('../services/memberService');

const router = express.Router();

router.post('/', authMiddleware(['customer']), async (req, res) => {
  try {
    const { pet_id, groomer_id, service_id, appointment_date, appointment_time } = req.body;

    if (!pet_id || !groomer_id || !service_id || !appointment_date || !appointment_time) {
      return fail(res, getError('PARAM_ERROR', '宠物、美容师、服务项目、日期、时段均不能为空'));
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const timePattern = /^([01]\d|2[0-3]):([03]0)$/;
    if (!datePattern.test(appointment_date)) {
      return fail(res, getError('PARAM_ERROR', '日期格式应为 YYYY-MM-DD'));
    }
    if (!timePattern.test(appointment_time)) {
      return fail(res, getError('PARAM_ERROR', '时间格式应为 HH:MM (以0或30分结尾)'));
    }

    const now = new Date();
    const appointmentDateTime = new Date(`${appointment_date}T${appointment_time}:00`);
    if (appointmentDateTime < now) {
      return fail(res, getError('TIME_INVALID'));
    }

    const pet = await queryOne('SELECT * FROM pets WHERE id = ?', [pet_id]);
    if (!pet) {
      return fail(res, getError('PET_NOT_FOUND'), 404);
    }
    if (pet.owner_id !== req.user.id) {
      return fail(res, getError('PET_NOT_OWNER'), 403);
    }

    const groomer = await queryOne('SELECT * FROM groomers WHERE id = ?', [groomer_id]);
    if (!groomer) {
      return fail(res, getError('GROOMER_NOT_FOUND'), 404);
    }

    const service = await queryOne('SELECT * FROM services WHERE id = ?', [service_id]);
    if (!service) {
      return fail(res, getError('SERVICE_NOT_FOUND'), 404);
    }

    const conflict = await queryOne(
      `SELECT id FROM appointments 
       WHERE groomer_id = ? AND appointment_date = ? AND appointment_time = ? 
       AND status != '已取消'`,
      [groomer_id, appointment_date, appointment_time]
    );
    if (conflict) {
      return fail(res, getError('APPOINTMENT_CONFLICT'));
    }

    const result = await execute(
      `INSERT INTO appointments (customer_id, pet_id, groomer_id, service_id, 
        appointment_date, appointment_time, status) 
       VALUES (?, ?, ?, ?, ?, ?, '待服务')`,
      [req.user.id, pet_id, groomer_id, service_id, appointment_date, appointment_time]
    );

    const appointment = await getAppointmentDetail(result.lastID);
    return success(res, appointment, '预约下单成功');
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

router.get('/', authMiddleware(), async (req, res) => {
  try {
    const { status, date, groomer_id } = req.query;
    let sql = `SELECT a.*, 
      p.name as pet_name, p.breed as pet_breed, 
      g.name as groomer_name, 
      s.name as service_name, s.price as service_price, s.duration as service_duration,
      u.name as customer_name, u.phone as customer_phone
      FROM appointments a 
      JOIN pets p ON a.pet_id = p.id 
      JOIN groomers g ON a.groomer_id = g.id 
      JOIN services s ON a.service_id = s.id 
      JOIN users u ON a.customer_id = u.id WHERE 1=1`;
    const params = [];

    if (req.user.role === 'customer') {
      sql += ' AND a.customer_id = ?';
      params.push(req.user.id);
    }

    if (status) {
      sql += ' AND a.status = ?';
      params.push(status);
    }
    if (date) {
      sql += ' AND a.appointment_date = ?';
      params.push(date);
    }
    if (groomer_id) {
      sql += ' AND a.groomer_id = ?';
      params.push(groomer_id);
    }

    sql += ' ORDER BY a.appointment_date DESC, a.appointment_time DESC';
    const appointments = await query(sql, params);

    return success(res, appointments);
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

router.get('/:id', authMiddleware(), async (req, res) => {
  try {
    const appointment = await getAppointmentDetail(req.params.id);
    if (!appointment) {
      return fail(res, getError('APPOINTMENT_NOT_FOUND'), 404);
    }
    if (req.user.role === 'customer' && appointment.customer_id !== req.user.id) {
      return fail(res, getError('APPOINTMENT_NOT_OWNER'), 403);
    }
    return success(res, appointment);
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

router.put('/:id/cancel', authMiddleware(), async (req, res) => {
  try {
    const { cancel_reason } = req.body;
    const appointment = await queryOne('SELECT * FROM appointments WHERE id = ?', [req.params.id]);
    if (!appointment) {
      return fail(res, getError('APPOINTMENT_NOT_FOUND'), 404);
    }
    if (req.user.role === 'customer' && appointment.customer_id !== req.user.id) {
      return fail(res, getError('APPOINTMENT_NOT_OWNER'), 403);
    }
    if (appointment.status === '已完成' || appointment.status === '服务中') {
      return fail(res, getError('APPOINTMENT_STATUS_INVALID', '服务中或已完成的预约无法取消'));
    }
    if (appointment.status === '已取消') {
      return fail(res, getError('APPOINTMENT_STATUS_INVALID', '预约已取消'));
    }

    await execute(
      `UPDATE appointments SET status = '已取消', cancel_reason = ? WHERE id = ?`,
      [cancel_reason || '用户主动取消', req.params.id]
    );

    const updated = await getAppointmentDetail(req.params.id);
    return success(res, updated, '预约取消成功');
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

router.put('/:id/status', authMiddleware(['admin', 'staff']), async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['待服务', '服务中', '已完成', '已取消'];
    if (!validStatuses.includes(status)) {
      return fail(res, getError('PARAM_ERROR', '状态值无效'));
    }

    const appointment = await queryOne('SELECT * FROM appointments WHERE id = ?', [req.params.id]);
    if (!appointment) {
      return fail(res, getError('APPOINTMENT_NOT_FOUND'), 404);
    }

    await execute('UPDATE appointments SET status = ? WHERE id = ?', [status, req.params.id]);
    const updated = await getAppointmentDetail(req.params.id);
    return success(res, updated, '预约状态更新成功');
  } catch (err) {
    console.error(err);
    return fail(res, getError('DATABASE_ERROR', err.message), 500);
  }
});

async function getAppointmentDetail(id) {
  return await queryOne(
    `SELECT a.*, 
      p.name as pet_name, p.breed as pet_breed, p.weight as pet_weight, 
      g.name as groomer_name, g.phone as groomer_phone,
      s.name as service_name, s.price as service_price, s.duration as service_duration,
      u.name as customer_name, u.phone as customer_phone
      FROM appointments a 
      JOIN pets p ON a.pet_id = p.id 
      JOIN groomers g ON a.groomer_id = g.id 
      JOIN services s ON a.service_id = s.id 
      JOIN users u ON a.customer_id = u.id 
      WHERE a.id = ?`,
    [id]
  );
}

module.exports = router;
