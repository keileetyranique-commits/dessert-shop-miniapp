import { createContext, useContext } from 'react';
export const MerchantContext = createContext({ token: '', storeId: '' });
export const useMerchant = () => useContext(MerchantContext);
