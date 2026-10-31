export type OrderAction =
  | 'RECOVER_CANCEL'
  | 'PAY'
  | 'PAY_FAIL'
  | 'ACCEPT'
  | 'REJECT'
  | 'READY'
  | 'DISPATCH'
  | 'DRIVER_ACCEPT'
  | 'DRIVER_FAIL'
  | 'DELIVERED'
  | 'PICKUP'
  | 'CANCEL'
  | 'EXPIRE';
export interface OrderState {
  order:
    | 'PENDING_PAYMENT'
    | 'AWAITING_ACCEPTANCE'
    | 'PREPARING'
    | 'READY'
    | 'IN_DELIVERY'
    | 'COMPLETED'
    | 'CANCELLED';
  payment: 'UNPAID' | 'PAID' | 'FAILED' | 'REFUNDED';
  fulfillment:
    | 'NOT_STARTED'
    | 'PREPARING'
    | 'READY'
    | 'DISPATCHING'
    | 'DELIVERING'
    | 'FAILED'
    | 'DELIVERED'
    | 'PICKED_UP'
    | 'CANCELLED';
  reservation: 'HELD' | 'CONSUMED' | 'RELEASED';
  mode: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
}
export function initialOrderState(mode: OrderState['mode']): OrderState {
  return {
    order: 'PENDING_PAYMENT',
    payment: 'UNPAID',
    fulfillment: 'NOT_STARTED',
    reservation: 'HELD',
    mode,
  };
}

/** Pure transition policy; authorization, profit checks and atomic inventory updates belong to the transaction service. */
export function transitionOrder(
  current: OrderState,
  action: OrderAction,
): OrderState {
  const next = { ...current };
  const invalid = () => {
    throw new Error('当前订单状态不允许此操作');
  };
  const cancel = (failed = false) => {
    next.order = 'CANCELLED';
    next.payment =
      current.payment === 'PAID'
        ? 'REFUNDED'
        : failed
          ? 'FAILED'
          : current.payment;
    next.fulfillment = 'CANCELLED';
    next.reservation = 'RELEASED';
  };
  switch (action) {
    case 'RECOVER_CANCEL':
      if (current.order === 'CANCELLED') return next;
      if (!['PREPARING', 'READY'].includes(current.order)) return invalid();
      cancel();
      break;
    case 'PAY':
      if (current.payment === 'PAID' || current.order === 'CANCELLED')
        return next;
      if (current.order !== 'PENDING_PAYMENT') return invalid();
      next.payment = 'PAID';
      next.order = 'AWAITING_ACCEPTANCE';
      break;
    case 'PAY_FAIL':
      if (current.payment === 'PAID' || current.order === 'CANCELLED')
        return next;
      if (current.order !== 'PENDING_PAYMENT') return invalid();
      cancel(true);
      break;
    case 'CANCEL':
    case 'EXPIRE':
    case 'REJECT':
      if (current.order === 'CANCELLED') return next;
      if (action === 'REJECT' && current.order !== 'AWAITING_ACCEPTANCE')
        return invalid();
      if (!['PENDING_PAYMENT', 'AWAITING_ACCEPTANCE'].includes(current.order))
        return invalid();
      cancel();
      break;
    case 'ACCEPT':
      if (current.order === 'PREPARING') return next;
      if (current.order !== 'AWAITING_ACCEPTANCE' || current.payment !== 'PAID')
        return invalid();
      next.order = 'PREPARING';
      next.fulfillment = 'PREPARING';
      break;
    case 'READY':
      if (current.order === 'READY') return next;
      if (current.order !== 'PREPARING') return invalid();
      next.order = 'READY';
      next.fulfillment = 'READY';
      break;
    case 'DISPATCH':
      if (current.mode !== 'DELIVERY' || current.order !== 'READY')
        return invalid();
      if (current.fulfillment === 'DISPATCHING') return next;
      if (!['READY', 'FAILED'].includes(current.fulfillment)) return invalid();
      next.fulfillment = 'DISPATCHING';
      break;
    case 'DRIVER_ACCEPT':
      if (current.fulfillment === 'DELIVERING') return next;
      if (current.mode !== 'DELIVERY' || current.fulfillment !== 'DISPATCHING')
        return invalid();
      next.order = 'IN_DELIVERY';
      next.fulfillment = 'DELIVERING';
      break;
    case 'DRIVER_FAIL':
      if (current.fulfillment === 'FAILED') return next;
      if (current.fulfillment !== 'DISPATCHING') return invalid();
      next.fulfillment = 'FAILED';
      break;
    case 'DELIVERED':
      if (current.fulfillment === 'DELIVERED') return next;
      if (
        current.order !== 'IN_DELIVERY' ||
        current.fulfillment !== 'DELIVERING'
      )
        return invalid();
      next.order = 'COMPLETED';
      next.fulfillment = 'DELIVERED';
      next.reservation = 'CONSUMED';
      break;
    case 'PICKUP':
      if (current.fulfillment === 'PICKED_UP') return next;
      if (current.mode === 'DELIVERY' || current.order !== 'READY')
        return invalid();
      next.order = 'COMPLETED';
      next.fulfillment = 'PICKED_UP';
      next.reservation = 'CONSUMED';
      break;
  }
  return next;
}
