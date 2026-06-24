const errorCodes = {
  SUCCESS: { code: 0, message: '成功' },
  PARAM_ERROR: { code: 10001, message: '参数错误' },
  UNAUTHORIZED: { code: 10002, message: '未授权或Token无效' },
  TOKEN_EXPIRED: { code: 10003, message: 'Token已过期' },
  FORBIDDEN: { code: 10004, message: '无权限操作' },
  NOT_FOUND: { code: 10005, message: '资源不存在' },

  USER_NOT_FOUND: { code: 20001, message: '用户不存在' },
  USER_EXISTS: { code: 20002, message: '用户名已存在' },
  WRONG_PASSWORD: { code: 20003, message: '密码错误' },

  PET_NOT_FOUND: { code: 30001, message: '宠物档案不存在' },
  PET_NOT_OWNER: { code: 30002, message: '无权限操作该宠物档案' },

  GROOMER_NOT_FOUND: { code: 40001, message: '美容师不存在' },
  SERVICE_NOT_FOUND: { code: 40002, message: '服务项目不存在' },
  APPOINTMENT_CONFLICT: { code: 40003, message: '该美容师此时段已有预约' },
  APPOINTMENT_NOT_FOUND: { code: 40004, message: '预约不存在' },
  APPOINTMENT_NOT_OWNER: { code: 40005, message: '无权限操作该预约' },
  APPOINTMENT_STATUS_INVALID: { code: 40006, message: '预约状态不允许此操作' },
  TIME_INVALID: { code: 40007, message: '预约时间不能早于当前时间' },
  REMARK_TOO_LONG: { code: 40008, message: '备注长度超过限制' },

  RECORD_NOT_FOUND: { code: 50001, message: '服务记录不存在' },
  RECORD_EXISTS: { code: 50002, message: '该预约已有服务记录' },
  PHOTOS_LIMIT: { code: 50003, message: '最多只能上传3张照片' },

  MEMBER_NOT_FOUND: { code: 60001, message: '会员信息不存在' },

  DATABASE_ERROR: { code: 90001, message: '数据库操作错误' },
  UNKNOWN_ERROR: { code: 99999, message: '未知错误' }
};

function getError(errorKey, customMessage) {
  const err = errorCodes[errorKey] || errorCodes.UNKNOWN_ERROR;
  return {
    code: err.code,
    message: customMessage || err.message
  };
}

module.exports = { errorCodes, getError };
