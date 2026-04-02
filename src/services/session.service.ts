import { query } from '../database/connection';
import crypto from 'crypto';

/**
 * 生成设备ID（基于User-Agent和其他信息）
 */
export function generateDeviceId(userAgent: string, ip: string): string {
  const hash = crypto.createHash('md5');
  hash.update(`${userAgent}${ip}`);
  return hash.digest('hex');
}

/**
 * 检查用户是否在其他设备登录
 */
export async function checkExistingSession(userId: number, currentDeviceId: string) {
  const result = await query(
    `SELECT id, device_id, device_name, ip_address, last_active_at 
     FROM active_sessions 
     WHERE user_id = $1 AND device_id != $2
     ORDER BY last_active_at DESC
     LIMIT 1`,
    [userId, currentDeviceId]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * 创建新会话
 */
export async function createSession(params: {
  userId: number;
  token: string;
  deviceId: string;
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  const { userId, token, deviceId, deviceName, ipAddress, userAgent } = params;

  // 先删除该设备的旧会话（如果存在）
  await query(
    'DELETE FROM active_sessions WHERE user_id = $1 AND device_id = $2',
    [userId, deviceId]
  );

  // 创建新会话
  await query(
    `INSERT INTO active_sessions 
     (user_id, token, device_id, device_name, ip_address, user_agent, last_active_at) 
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
    [userId, token, deviceId, deviceName || 'Unknown Device', ipAddress, userAgent]
  );
}

/**
 * 踢出其他设备的会话
 */
export async function kickOtherSessions(userId: number, currentDeviceId: string) {
  const result = await query(
    'DELETE FROM active_sessions WHERE user_id = $1 AND device_id != $2 RETURNING id',
    [userId, currentDeviceId]
  );

  return result.rowCount || 0;
}

/**
 * 删除会话（登出）
 */
export async function deleteSession(userId: number, token: string) {
  await query(
    'DELETE FROM active_sessions WHERE user_id = $1 AND token = $2',
    [userId, token]
  );
}

/**
 * 验证会话是否有效
 */
export async function validateSession(userId: number, token: string): Promise<boolean> {
  const result = await query(
    'SELECT id FROM active_sessions WHERE user_id = $1 AND token = $2',
    [userId, token]
  );

  return result.rows.length > 0;
}

/**
 * 更新会话活跃时间
 */
export async function updateSessionActivity(userId: number, token: string) {
  await query(
    'UPDATE active_sessions SET last_active_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND token = $2',
    [userId, token]
  );
}

/**
 * 清理过期会话（超过7天未活跃）
 */
export async function cleanExpiredSessions() {
  const result = await query(
    `DELETE FROM active_sessions 
     WHERE last_active_at < CURRENT_TIMESTAMP - INTERVAL '7 days' 
     RETURNING id`
  );

  return result.rowCount || 0;
}

/**
 * 获取用户的所有活跃会话
 */
export async function getUserSessions(userId: number) {
  const result = await query(
    `SELECT id, device_id, device_name, ip_address, last_active_at, created_at 
     FROM active_sessions 
     WHERE user_id = $1 
     ORDER BY last_active_at DESC`,
    [userId]
  );

  return result.rows;
}
