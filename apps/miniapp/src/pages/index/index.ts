import { API_BASE_URL } from '../../runtime';
Page({
  data: { status: '尚未连接服务' },
  onLoad() {
    this.checkConnection();
  },
  checkConnection() {
    this.setData({ status: '正在连接服务…' });
    wx.request<{ testMode: boolean; schemaVersion: number }>({
      url: API_BASE_URL + '/runtime',
      success: (response) => {
        if (
          response.statusCode !== 200 ||
          response.data === null ||
          typeof response.data !== 'object' ||
          typeof response.data.testMode !== 'boolean' ||
          response.data.schemaVersion !== 1
        ) {
          this.setData({ status: '服务响应异常' });
          return;
        }
        this.setData({
          status: response.data.testMode
            ? '测试模式 · 不产生真实交易'
            : '正式模式',
        });
      },
      fail: () => this.setData({ status: '连接失败，请检查网络后重试' }),
    });
  },
});
