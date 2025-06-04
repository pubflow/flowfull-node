// Authorize.Net API Types

export interface AuthorizeNetConfig {
  apiLoginId: string;
  transactionKey: string;
  environment: 'sandbox' | 'production';
  signatureKey?: string;
}

// Transaction Types
export enum AuthorizeNetTransactionType {
  AUTH_ONLY = 'authOnlyTransaction',
  AUTH_CAPTURE = 'authCaptureTransaction',
  PRIOR_AUTH_CAPTURE = 'priorAuthCaptureTransaction',
  CAPTURE_ONLY = 'captureOnlyTransaction',
  VOID = 'voidTransaction',
  REFUND = 'refundTransaction'
}

// Transaction Status
export enum AuthorizeNetTransactionStatus {
  APPROVED = '1',
  DECLINED = '2',
  ERROR = '3',
  HELD_FOR_REVIEW = '4'
}

// Payment Method Types
export interface AuthorizeNetCreditCard {
  cardNumber: string;
  expirationDate: string; // MMYY format
  cardCode?: string; // CVV
}

export interface AuthorizeNetBankAccount {
  accountType: 'checking' | 'savings' | 'businessChecking';
  routingNumber: string;
  accountNumber: string;
  nameOnAccount: string;
  bankName?: string;
  echeckType: 'PPD' | 'WEB' | 'CCD' | 'TEL' | 'ARC' | 'BOC';
}

// Billing Information
export interface AuthorizeNetBillTo {
  firstName?: string;
  lastName?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phoneNumber?: string;
  faxNumber?: string;
}

// Transaction Request
export interface AuthorizeNetTransactionRequest {
  transactionType: AuthorizeNetTransactionType;
  amount: string;
  payment?: {
    creditCard?: AuthorizeNetCreditCard;
    bankAccount?: AuthorizeNetBankAccount;
  };
  profile?: {
    customerProfileId?: string;
    paymentProfileId?: string;
  };
  order?: {
    invoiceNumber?: string;
    description?: string;
  };
  lineItems?: AuthorizeNetLineItem[];
  tax?: {
    amount?: string;
    name?: string;
    description?: string;
  };
  duty?: {
    amount?: string;
    name?: string;
    description?: string;
  };
  shipping?: {
    amount?: string;
    name?: string;
    description?: string;
  };
  taxExempt?: boolean;
  poNumber?: string;
  customer?: {
    id?: string;
    email?: string;
  };
  billTo?: AuthorizeNetBillTo;
  shipTo?: AuthorizeNetBillTo;
  customerIP?: string;
  cardholderAuthentication?: {
    authenticationIndicator?: string;
    cardholderAuthenticationValue?: string;
  };
  retail?: {
    marketType?: string;
    deviceType?: string;
  };
  employeeId?: string;
  transactionSettings?: AuthorizeNetTransactionSetting[];
  userFields?: AuthorizeNetUserField[];
  surcharge?: {
    amount?: string;
    description?: string;
  };
  tip?: {
    amount?: string;
  };
  processingOptions?: {
    isFirstRecurringPayment?: boolean;
    isFirstSubsequentAuth?: boolean;
    isStoredCredentials?: boolean;
    isSubsequentAuth?: boolean;
  };
  subsequentAuthInformation?: {
    originalNetworkTransId?: string;
    originalAuthAmount?: string;
    reason?: string;
  };
  authorizationIndicatorType?: {
    authorizationIndicator?: string;
  };
}

export interface AuthorizeNetLineItem {
  itemId?: string;
  name?: string;
  description?: string;
  quantity?: string;
  unitPrice?: string;
  taxable?: boolean;
}

export interface AuthorizeNetTransactionSetting {
  settingName: string;
  settingValue: string;
}

export interface AuthorizeNetUserField {
  name: string;
  value: string;
}

// Transaction Response
export interface AuthorizeNetTransactionResponse {
  responseCode: string;
  authCode?: string;
  avsResultCode?: string;
  cvvResultCode?: string;
  cavvResultCode?: string;
  transId?: string;
  refTransID?: string;
  transHash?: string;
  testRequest?: string;
  accountNumber?: string;
  accountType?: string;
  splitTenderId?: string;
  prePaidCard?: {
    requestedAmount?: string;
    approvedAmount?: string;
    balanceOnCard?: string;
  };
  messages?: AuthorizeNetMessage[];
  errors?: AuthorizeNetError[];
  splitTenderPayments?: AuthorizeNetSplitTenderPayment[];
  userFields?: AuthorizeNetUserField[];
  shipTo?: AuthorizeNetBillTo;
  secureAcceptance?: {
    SecureAcceptanceUrl?: string;
  };
  emvResponse?: {
    tlvData?: string;
    tags?: AuthorizeNetEmvTag[];
  };
  transHashSha2?: string;
  profile?: {
    customerProfileId?: string;
    customerPaymentProfileId?: string;
    customerShippingAddressId?: string;
  };
  networkTransId?: string;
}

export interface AuthorizeNetMessage {
  code: string;
  description: string;
}

export interface AuthorizeNetError {
  errorCode: string;
  errorText: string;
}

export interface AuthorizeNetSplitTenderPayment {
  transId: string;
  responseCode: string;
  responseToCustomer: string;
  authCode: string;
  accountNumber: string;
  accountType: string;
  requestedAmount: string;
  approvedAmount: string;
  balanceOnCard: string;
}

export interface AuthorizeNetEmvTag {
  name: string;
  value: string;
  formatted: string;
}

// API Request/Response Wrapper
export interface AuthorizeNetApiRequest {
  createTransactionRequest: {
    merchantAuthentication: {
      name: string;
      transactionKey: string;
    };
    refId?: string;
    transactionRequest: AuthorizeNetTransactionRequest;
  };
}

export interface AuthorizeNetApiResponse {
  transactionResponse?: AuthorizeNetTransactionResponse;
  refId?: string;
  messages: {
    resultCode: 'Ok' | 'Error';
    message: AuthorizeNetMessage[];
  };
  sessionToken?: string;
}

// Customer Information Manager (CIM) Types
export interface AuthorizeNetCustomerProfile {
  merchantCustomerId?: string;
  description?: string;
  email?: string;
  paymentProfiles?: AuthorizeNetPaymentProfile[];
  shipToList?: AuthorizeNetAddress[];
}

export interface AuthorizeNetPaymentProfile {
  customerType?: 'individual' | 'business';
  billTo?: AuthorizeNetBillTo;
  payment: {
    creditCard?: AuthorizeNetCreditCard;
    bankAccount?: AuthorizeNetBankAccount;
  };
  defaultPaymentProfile?: boolean;
}

export interface AuthorizeNetAddress {
  firstName?: string;
  lastName?: string;
  company?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phoneNumber?: string;
  faxNumber?: string;
}

// CIM API Requests
export interface AuthorizeNetCreateCustomerProfileRequest {
  profile: AuthorizeNetCustomerProfile;
  validationMode?: 'none' | 'testMode' | 'liveMode';
}

export interface AuthorizeNetCreatePaymentProfileRequest {
  customerProfileId: string;
  paymentProfile: AuthorizeNetPaymentProfile;
  validationMode?: 'none' | 'testMode' | 'liveMode';
}

// CIM API Responses
export interface AuthorizeNetCreateCustomerProfileResponse {
  customerProfileId?: string;
  customerPaymentProfileIdList?: string[];
  customerShippingAddressIdList?: string[];
  validationDirectResponseList?: string[];
  messages: {
    resultCode: 'Ok' | 'Error';
    message: AuthorizeNetMessage[];
  };
}

export interface AuthorizeNetCreatePaymentProfileResponse {
  customerPaymentProfileId?: string;
  validationDirectResponse?: string;
  messages: {
    resultCode: 'Ok' | 'Error';
    message: AuthorizeNetMessage[];
  };
}

// Webhook Types
export interface AuthorizeNetWebhookPayload {
  notificationId: string;
  eventType: string;
  eventDate: string;
  webhookId: string;
  payload: {
    responseCode: number;
    authCode?: string;
    avsResultCode?: string;
    cvvResultCode?: string;
    cavvResultCode?: string;
    transId: string;
    refTransID?: string;
    transHash: string;
    testRequest: string;
    accountNumber: string;
    accountType: string;
    requestedAmount: string;
    authAmount: string;
    settleAmount: string;
    tax?: {
      amount: string;
      name: string;
      description: string;
    };
    shipping?: {
      amount: string;
      name: string;
      description: string;
    };
    duty?: {
      amount: string;
      name: string;
      description: string;
    };
    lineItems?: AuthorizeNetLineItem[];
    prepaidCard?: {
      requestedAmount: string;
      approvedAmount: string;
      balanceOnCard: string;
    };
    merchantReferenceId?: string;
    customerProfileId?: string;
    customerPaymentProfileId?: string;
    customerShippingAddressId?: string;
    order?: {
      invoiceNumber: string;
      description: string;
    };
    orderDescription?: string;
    orderInvoiceNumber?: string;
    recurringBilling?: boolean;
    cardCodeResponse?: string;
    batch?: {
      batchId: string;
      settlementTimeUTC: string;
      settlementTimeLocal: string;
      settlementState: string;
    };
    product?: string;
    marketType?: string;
    deviceType?: string;
    customerIP?: string;
    subscription?: {
      id: number;
      payNum: number;
    };
    profile?: {
      customerProfileId: string;
      customerPaymentProfileId: string;
      customerShippingAddressId?: string;
    };
  };
}

// Error Types
export interface AuthorizeNetErrorResponse {
  messages: {
    resultCode: 'Error';
    message: AuthorizeNetMessage[];
  };
}
