// Synthetic, in-memory visual fixtures. Never a business/backend implementation.
export function createFixtures() {
  const now = new Date().toISOString();
  const merchant = {
    id: 1,
    username: 'demo',
    name: '餐饮体验店（演示）',
    shopName: '餐饮体验店（演示）',
    auditStatus: 2,
    balance: 1268.5,
    unreceivedBalance: 168,
    frozenBalance: 0,
    totalIncome: 5680,
    mobile: '00000000000',
    realName: '演示商家',
    bankCard: '仅演示，不可提现',
    openingBankName: '演示银行',
  };
  const shop = {
    id: 1,
    name: merchant.shopName,
    shopName: merchant.shopName,
    isOperating: true,
    isOpenOrderAudio: false,
    isOpenLocalPrint: false,
    isOpenCloudPrint: false,
    startTime: '09:00',
    endTime: '22:00',
    reducedDeliveryPrice: 0,
    announcement: '独立演示门店，所有订单和金额均为样例',
    province: '广东省',
    city: '深圳市',
    area: '南山区',
    address: '演示街道（非真实地址）',
    contactPhone: '00000000000',
    shopLogoImg: 'drink.svg',
    shopWithinImg: 'meal.svg',
    deliveryFee: 3,
    packingCharges: 1,
    kitchenTotalOrderPrinterId: 1,
    checkoutPrinterId: 1,
    shopType: 1,
  };
  const menu = ['招牌饮品', '现制轻食', '季节限定'].map((name, i) => ({
    id: i + 1,
    name,
    detail: '本地演示分类',
    isDisabled: false,
    sortNumber: i,
    createTime: now,
    updateTime: now,
  }));
  const goods = [
    '招牌柠檬茶（演示）',
    '鲜奶拿铁（演示）',
    '鸡肉轻食碗（演示）',
    '草莓气泡饮（演示）',
  ].map((name, i) => ({
    id: i + 1,
    name,
    menuId: i === 2 ? 2 : 1,
    menuIdList: [i === 2 ? 2 : 1],
    menuName: i === 2 ? '现制轻食' : '招牌饮品',
    mainImage: i === 2 ? 'meal.svg' : 'drink.svg',
    subImages: 'drink.svg',
    detail: '本地演示商品，可体验原版编辑表单。',
    price: [12, 18, 28, 16][i],
    salePrice: [12, 18, 28, 16][i],
    packingCharges: 1,
    status: i === 3 ? 3 : 2,
    stock: 100,
    sales: 12,
    saleqty: 12,
    saleQuantity: 12,
    monthlySales: 12,
    unit: '份',
    createTime: now,
    updateTime: now,
    isHot: false,
    isNew: true,
    printerId: '1',
    isSale: true,
    isSoldOut: false,
    isSingle: true,
    standData: [],
    goodsSpecificationList: [],
  }));
  const orders = [1, 2].flatMap((shoppingWay) =>
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((status) => ({
      id: shoppingWay * 100 + status,
      orderNo: `DEMO-${shoppingWay}-${status}`,
      queueNo: `A${shoppingWay}${status}`,
      description: '柠檬茶 × 1、轻食碗 × 1（演示）',
      goodsTotalPrice: 40,
      actualPrice: 38,
      packingCharges: 2,
      deliveryFee: shoppingWay === 2 ? 3 : 0,
      goodsTotalQuantity: 2,
      paymentMode: 1,
      shoppingWay,
      status,
      remark: '本地演示订单，不会真实制作或配送',
      contactRealname: '演示顾客',
      contactPhone: '00000000000',
      contactProvince: '广东省',
      contactCity: '深圳市',
      contactArea: '南山区',
      contactStreet: '演示地址',
      contactHouseNumber: '样例 1 号',
      createTime: now,
      paymentTime: now,
      refundType: 1,
      refundWay: 1,
      refundReason: 1,
      refundAmount: 12,
      refundStatus: 1,
      refundCreateTime: now,
    })),
  );
  const tables = {
    menu,
    goods,
    order: orders,
    fullReductionRule: [
      {
        id: 1,
        name: '午间满减（演示）',
        limitedPrice: 30,
        reducedPrice: 5,
        status: 1,
      },
    ],
    coupons: [
      {
        id: 1,
        name: '饮品优惠券（演示）',
        preferentialType: 1,
        limitedPrice: 20,
        reducedPrice: 3,
        discountAmount: 0.9,
        description: '演示优惠券，不可真实核销',
        validType: 1,
        validDays: 7,
        validStartTime: now,
        validEndTime: now,
        status: 1,
        gaveCount: 30,
        usedCount: 8,
        goodsIdList: [1],
        couponsGoodsRelationList: [{ goodsId: 1 }],
      },
    ],
    printer: [1, 2].map((type) => ({
      id: type,
      type,
      name: type === 1 ? '后厨小票打印机（演示）' : '饮品标签打印机（演示）',
      brand: 1,
      sn: 'DEMO-PRINTER',
      key: '演示设备，不连接打印',
      status: 1,
      createTime: now,
    })),
    merchantBillingRecord: [
      {
        id: 1,
        type: 1,
        operateType: 1,
        coinType: 1,
        number: 38,
        message: '演示订单入账，不是真实收入',
        createTime: now,
      },
      {
        id: 2,
        type: 2,
        operateType: 2,
        coinType: 1,
        number: 12,
        message: '演示退款记录',
        createTime: now,
      },
    ],
    merchantWithdrawRecord: [
      {
        id: 1,
        withdrawAmount: 100,
        platformFee: 0,
        actualAmount: 100,
        auditStatus: 2,
        auditReason: '',
        createTime: now,
        auditTime: now,
      },
    ],
    rider: [
      {
        id: 1,
        name: '演示骑手',
        realName: '演示骑手',
        mobile: '00000000000',
        phone: '00000000000',
        status: 1,
      },
    ],
    appraise: [
      {
        id: 1,
        content: '本地演示评价',
        score: 5,
        nickname: '演示顾客',
        createTime: now,
      },
    ],
    merchantRecommendGoods: [{ ...goods[0], goodsId: 1 }],
    shopChangeRecord: [
      {
        id: 1,
        shopName: shop.name,
        auditStatus: 2,
        createTime: now,
        updateTime: now,
        auditReason: '演示审核记录',
      },
    ],
    goodsSpecification: [
      {
        id: 1,
        goodsId: 1,
        name: '温度',
        goodsSpecificationOptionList: [{ id: 1, name: '少冰', price: 0 }],
      },
    ],
    goodsSpecificationOption: [{ id: 1, name: '少冰', price: 0 }],
    orderDetail: [
      {
        id: 1,
        goodsName: '招牌柠檬茶（演示）',
        goodsId: 1,
        number: 1,
        quantity: 1,
        price: 12,
        subtotal: 12,
        mainImage: 'drink.svg',
        goodsSpecification: '少冰',
      },
    ],
  };
  Object.assign(merchant, {
    withdrawableBalance: 1268.5,
    orderFrozenBalance: 168,
  });
  for (const printer of tables.printer)
    Object.assign(printer, {
      number: 'DEMO-' + printer.id,
      identifyingCode: '非真实设备',
      isAutoPrint: 0,
      updateTime: now,
    });
  function handle(path, body = {}) {
    if (path === '/rest/merchant/getLoginMerchantInfo') return merchant;
    if (path === '/rest/merchant/shop/getLoginMerchantShopInfo') return shop;
    if (path === '/rest/merchant/statistics/todayStatistic')
      return {
        dayCountPaid: 28,
        daySumMerchantIncome: 586,
        todayCountIntoShop: 126,
        todayCountShoppingCartGoodsNumber: 47,
        waitHandleOrderCount: 3,
        waitDeliverOrderCount: 2,
        completedOrderCount: 21,
        handleOrderRefundCount: 1,
        underShelfGoodsCount: 1,
        onShelfGoodsCount: 3,
        sellOutGoodsCount: 0,
        allGoodsCount: 4,
        perCustomerTransaction: 20.93,
        orderConversionRate: 0.37,
        orderPaymentConversionRate: 0.6,
        paymentConversionRate: 0.22,
      };
    if (path === '/rest/merchant/order/statistic')
      return {
        resultList: Array.from({ length: 7 }, (_, i) => ({
          date: new Date(Date.now() - (6 - i) * 86400000)
            .toISOString()
            .slice(0, 10),
          orderCount: 20 + i * 2,
          orderAmount: 400 + i * 32,
        })),
        thisMonthCountPaid: 280,
        lastMonthCountPaid: 250,
        thisWeekCountPaid: 140,
        lastWeekCountPaid: 130,
        thisMonthSumActualPrice: 5680,
        lastMonthSumActualPrice: 5000,
        thisWeekSumActualPrice: 2800,
        lastWeekSumActualPrice: 2600,
      };
    if (path === '/rest/merchant/order/selectAllTabWaitHandleNum')
      return {
        waitHandleNum: 1,
        waitPickUpNum: 1,
        waitDeliverNum: 1,
        waitDeliveryNum: 1,
        deliveredNum: 1,
      };
    if (path.endsWith('/statisticalAmount'))
      return {
        incomeAmount: 586,
        expendAmount: 12,
        withdrawalSuccessfulAmount: 100,
      };
    if (path === '/rest/setting/selectCurrent')
      return { merchantWithdrawFee: 0 };
    const match = path.match(/^\/rest\/merchant\/([^/]+)\/([^/]+)$/);
    if (!match) return undefined;
    const [, entity, action] = match;
    const rows = tables[entity];
    if (!rows) return undefined;
    if (
      action === 'list' ||
      (entity === 'order' &&
        ['afterSalesList', 'todayOrderList'].includes(action))
    ) {
      let records = rows.filter(
        (row) => !body.name || row.name?.includes(body.name),
      );
      for (const key of [
        'menuId',
        'shoppingWay',
        'status',
        'type',
        'goodsId',
      ]) {
        if (
          body[key] !== undefined &&
          body[key] !== '' &&
          Number(body[key]) > 0
        )
          records = records.filter((row) => row[key] === Number(body[key]));
      }
      if (action === 'afterSalesList')
        records = records.filter((row) => row.status === 7);
      const total = records.length;
      if (Number(body.pageNo) > 0)
        records = records.slice(
          (body.pageNo - 1) * (body.pageSize || 10),
          body.pageNo * (body.pageSize || 10),
        );
      return {
        records,
        total,
        size: body.pageSize || 10,
        current: body.pageNo || 1,
      };
    }
    if (['getById', 'selectById', 'detail'].includes(action))
      return rows.find((row) => row.id === Number(body.id)) || null;
    // Only catalogue/marketing demo edits, never financial/order execution.
    if (!['goods', 'menu', 'coupons', 'fullReductionRule'].includes(entity))
      return undefined;
    if (action === 'insert') {
      const row = {
        ...body,
        id: Math.max(0, ...rows.map((r) => r.id)) + 1,
        createTime: now,
        updateTime: now,
      };
      if (entity === 'goods')
        row.menuName =
          menu.find((m) => m.id === Number(body.menuId || body.menuIdList?.[0]))
            ?.name || '演示分类';
      rows.push(row);
      return row.id;
    }
    if (action === 'update') {
      const row = rows.find((r) => r.id === Number(body.id));
      if (!row) return undefined;
      Object.assign(row, body, { updateTime: now });
      return row.id;
    }
    if (action === 'delete') {
      const ids = body.ids || [body.id];
      tables[entity] = rows.filter((r) => !ids.map(Number).includes(r.id));
      return {};
    }
    return undefined;
  }
  return { handle, tables };
}
