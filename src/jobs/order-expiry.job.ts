import cron from 'node-cron';
import { PaymentService } from '@services/payment.service';

/**
 * 定时扫描过期订单任务
 * 每分钟运行一次，将超过15分钟未支付的订单标记为已关闭
 */
export function startOrderExpiryJob() {
  // 每分钟运行一次
  cron.schedule('*/1 * * * *', async () => {
    try {
      console.log('[Job] 开始扫描过期订单...');
      const result: any = await PaymentService.scanExpiredOrders();
      const closedCount = typeof result === 'number' ? result : (result?.closedCount || 0);
      if (closedCount > 0) {
        console.log(`[Job] 已关闭 ${closedCount} 个过期订单`);
      }
    } catch (error) {
      console.error('[Job] 扫描过期订单失败:', error);
    }
  });

  console.log('[Job] 订单过期扫描定时任务已启动（每分钟执行）');
}

/**
 * 停止定时任务
 */
export function stopOrderExpiryJob() {
cron.getTasks().forEach((task: any) => { // 临时用 any，也可以查 node-cron 文档找准确类型
    task.stop();
    task.destroy();
  });
  console.log('[Job] 所有定时任务已停止');
}
