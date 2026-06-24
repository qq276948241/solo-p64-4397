const config = require('../config');
const { getError } = require('../utils/errorCodes');
const { fail } = require('../utils/response');

function validateAppointment(req, res, next) {
  const { pet_id, groomer_id, service_id, appointment_date, appointment_time, remark } = req.body;

  if (!pet_id || !groomer_id || !service_id || !appointment_date || !appointment_time) {
    return fail(res, getError('PARAM_ERROR', '宠物、美容师、服务项目、日期、时段均不能为空'));
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(appointment_date)) {
    return fail(res, getError('PARAM_ERROR', '日期格式应为 YYYY-MM-DD'));
  }

  if (!/^([01]\d|2[0-3]):([03]0)$/.test(appointment_time)) {
    return fail(res, getError('PARAM_ERROR', '时间格式应为 HH:MM (以0或30分结尾)'));
  }

  const appointmentDateTime = new Date(`${appointment_date}T${appointment_time}:00`);
  if (appointmentDateTime < new Date()) {
    return fail(res, getError('TIME_INVALID'));
  }

  if (remark !== undefined && remark !== null) {
    if (typeof remark !== 'string') {
      return fail(res, getError('PARAM_ERROR', '备注必须为字符串'));
    }
    if (remark.length > config.remarkMaxLength) {
      return fail(res, getError('REMARK_TOO_LONG', `备注长度不能超过${config.remarkMaxLength}字`));
    }
  }

  next();
}

function validatePhotos(req, res, next) {
  const { photo_urls } = req.body;

  if (photo_urls !== undefined) {
    if (!Array.isArray(photo_urls)) {
      return fail(res, getError('PARAM_ERROR', '照片URL必须是数组'));
    }
    if (photo_urls.length > config.maxPhotos) {
      return fail(res, getError('PHOTOS_LIMIT'));
    }
  }

  next();
}

module.exports = { validateAppointment, validatePhotos };
