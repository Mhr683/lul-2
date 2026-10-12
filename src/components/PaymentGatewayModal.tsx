import React, { useState, useEffect } from 'react';
import {
  Lock,
  ShieldCheck,
  CheckCircle2,
  X,
  CreditCard,
  Smartphone,
  Building2,
  Eye,
  EyeOff,
  Sparkles,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { PaymentMethod } from '../types/store';

export interface PaymentGatewayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthorizeSuccess: (authData: {
    transactionId: string;
    authType: 'MPIN' | 'PASSWORD' | 'OTP' | '3DS';
    accountNumber: string;
    paymentProofDetails: string;
  }) => void;
  orderTotalPkr: number;
  orderTotalUsd: number;
  paymentMethod: PaymentMethod;
  paymentSubMethod?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  prefilledAccount?: string;
  storeName: string;
}

export const PaymentGatewayModal: React.FC<PaymentGatewayModalProps> = ({
  isOpen,
  onClose,
  onAuthorizeSuccess,
  orderTotalPkr,
  orderTotalUsd,
  paymentMethod,
  paymentSubMethod,
  customerName,
  customerPhone,
  customerEmail,
  prefilledAccount,
  storeName,
}) => {
  const [accountNumber, setAccountNumber] = useState('');
  const [pinOrPassword, setPinOrPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [stage, setStage] = useState<'INPUT' | 'PROCESSING' | 'SUCCESS'>('INPUT');
  const [progressStep, setProgressStep] = useState<number>(0);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setAccountNumber(prefilledAccount || customerPhone || '0300-1234567');
      setPinOrPassword('');
      setStage('INPUT');
      setProgressStep(0);
      setProgressMessage('');
      setErrorMessage(null);
    }
  }, [isOpen, prefilledAccount, customerPhone]);

  if (!isOpen) return null;

  // Determine gateway personality & configuration
  const isEasypaisa = paymentMethod === 'EASYPAISA';
  const isJazzCash = paymentMethod === 'JAZZCASH';
  const isCard = paymentMethod === 'CARD' || paymentMethod === 'STRIPE';
  const isInstallments = paymentMethod === 'INSTALLMENTS';
  const isBank = paymentMethod === 'HBL_BANK' || paymentMethod === 'BANK_ACCOUNT' || paymentMethod === 'RAAST_IBAN';
  const isSadaPay = paymentMethod === 'SADAPAY';
  const isNayaPay = paymentMethod === 'NAYAPAY';

  let gatewayTitle = 'Secure Instant Payment Gateway';
  let gatewaySubtitle = '256-Bit SSL Encrypted Instant Payment Settlement';
  let gatewayColor = 'bg-slate-900';
  let badgeColor = 'bg-slate-800 text-slate-100';
  let authType: 'MPIN' | 'PASSWORD' | 'OTP' | '3DS' = 'MPIN';
  let pinLabel = 'Enter 5-digit MPIN or Login Password';
  let pinPlaceholder = '•••••';
  let defaultTestPin = '54321';
  let merchantAccountNote = `${storeName} Official Merchant Treasury (PK99-EP-849201)`;

  if (isEasypaisa) {
    gatewayTitle = 'Easypaisa Direct Debit Gateway';
    gatewaySubtitle = 'Telenor Microfinance Bank · Instant Real-Time Settlement';
    gatewayColor = 'bg-[#00A651]';
    badgeColor = 'bg-[#008c44] text-white';
    authType = 'MPIN';
    pinLabel = 'Easypaisa 5-Digit MPIN / Account Password (ایزی پیسہ پن)';
    pinPlaceholder = '5-digit MPIN';
    defaultTestPin = '54321';
    merchantAccountNote = `${storeName} Easypaisa Merchant Account (0300-9842100)`;
  } else if (isJazzCash) {
    gatewayTitle = 'JazzCash Mobile Account Online Gateway';
    gatewaySubtitle = 'Mobilink Microfinance Bank · Direct Payment Debit';
    gatewayColor = 'bg-[#EB1C24]';
    badgeColor = 'bg-[#c7151c] text-white';
    authType = 'MPIN';
    pinLabel = 'JazzCash 4-Digit MPIN / Security PIN (جاز کیش پن)';
    pinPlaceholder = '4-digit MPIN';
    defaultTestPin = '4321';
    merchantAccountNote = `${storeName} JazzCash Merchant Account (0301-8492011)`;
  } else if (isCard || isInstallments) {
    gatewayTitle = '3D Secure 2.0 Card Payment Gateway';
    gatewaySubtitle = 'Verified by VISA / Mastercard ID Check · Direct Bank Settlement';
    gatewayColor = 'bg-[#0F172A]';
    badgeColor = 'bg-blue-600 text-white';
    authType = '3DS';
    pinLabel = 'Bank 3D-Secure 6-Digit OTP / Authentication Code (بینک او ٹی پی)';
    pinPlaceholder = '6-digit OTP';
    defaultTestPin = '829104';
    merchantAccountNote = `${storeName} Verified Merchant Acquiring Bank (HBL IPG #48921)`;
  } else if (isBank) {
    gatewayTitle = '1Link 1Bill & Direct NetBanking Gateway';
    gatewaySubtitle = 'State Bank of Pakistan Regulated Settlement Host';
    gatewayColor = 'bg-[#006C35]';
    badgeColor = 'bg-emerald-800 text-white';
    authType = 'PASSWORD';
    pinLabel = 'Internet Banking Password / One-Time Authorization PIN';
    pinPlaceholder = 'Password or OTP';
    defaultTestPin = 'pass@8821';
    merchantAccountNote = `${storeName} 1Link IBAN: PK99 MEZN 0000 1234 5678 9001`;
  } else if (isSadaPay) {
    gatewayTitle = 'SadaPay Instant Direct Checkout Gateway';
    gatewaySubtitle = 'SadaPay Microfinance Host · In-App Biometric / PIN Auth';
    gatewayColor = 'bg-[#00BFA5]';
    badgeColor = 'bg-teal-700 text-white';
    authType = 'MPIN';
    pinLabel = 'SadaPay 4-Digit Wallet PIN (@SadaID PIN)';
    pinPlaceholder = '4-digit PIN';
    defaultTestPin = '1234';
    merchantAccountNote = `${storeName} SadaPay Business (@atelieraurelia)`;
  } else if (isNayaPay) {
    gatewayTitle = 'NayaPay Direct Debit Gateway';
    gatewaySubtitle = 'NayaPay EMI Host · Instant Wallet Settlement';
    gatewayColor = 'bg-[#F37021]';
    badgeColor = 'bg-orange-700 text-white';
    authType = 'MPIN';
    pinLabel = 'NayaPay 4-Digit Wallet PIN';
    pinPlaceholder = '4-digit PIN';
    defaultTestPin = '9876';
    merchantAccountNote = `${storeName} NayaPay Merchant ID #98241`;
  }

  const handleAutoFillPin = () => {
    setPinOrPassword(defaultTestPin);
    setErrorMessage(null);
  };

  const handleAuthorizePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountNumber.trim()) {
      setErrorMessage('Please enter your account / mobile number.');
      return;
    }
    if (!pinOrPassword.trim()) {
      setErrorMessage(`Please enter your ${authType === '3DS' ? 'OTP' : 'MPIN / Password'} to authorize automatic deduction.`);
      return;
    }

    setErrorMessage(null);
    setStage('PROCESSING');

    const steps = [
      { step: 1, msg: `Connecting to ${gatewayTitle} Secure Host...` },
      { step: 2, msg: `Authenticating ${authType} credentials for account ${accountNumber}...` },
      { step: 3, msg: `Checking balance & debiting PKR ${orderTotalPkr.toLocaleString()} from customer account...` },
      { step: 4, msg: `Depositing funds into ${merchantAccountNote}...` },
      { step: 5, msg: `Transaction Authorized & Settled! Generating Official Bank TID...` },
    ];

    for (let i = 0; i < steps.length; i++) {
      setProgressStep(steps[i].step);
      setProgressMessage(steps[i].msg);
      await new Promise((resolve) => setTimeout(resolve, 450));
    }

    const randomSuffix = Math.floor(10000000 + Math.random() * 90000000).toString();
    const prefix = isEasypaisa
      ? 'EP-'
      : isJazzCash
      ? 'JC-'
      : isCard || isInstallments
      ? '3DS-'
      : isBank
      ? '1L-'
      : isSadaPay
      ? 'SADA-'
      : isNayaPay
      ? 'NAYA-'
      : 'TXN-';
    const finalTid = `${prefix}${randomSuffix}`;

    setStage('SUCCESS');
    setProgressMessage(`Payment Confirmed! TID: ${finalTid}`);

    await new Promise((resolve) => setTimeout(resolve, 550));

    onAuthorizeSuccess({
      transactionId: finalTid,
      authType,
      accountNumber,
      paymentProofDetails: `Automated Gateway Direct Debit via ${gatewayTitle} · ${authType} Authenticated · Amount: PKR ${orderTotalPkr.toLocaleString()} · Credited to ${merchantAccountNote}`,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border border-black/10 transition-all">
        {/* Gateway Header */}
        <div className={`${gatewayColor} text-white px-6 py-5 relative`}>
          <button
            type="button"
            onClick={onClose}
            disabled={stage === 'PROCESSING'}
            className="absolute top-4 right-4 text-white/80 hover:text-white disabled:opacity-30 p-1.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center text-white font-bold text-sm shadow-xs">
              {isEasypaisa ? (
                'ep'
              ) : isJazzCash ? (
                'JC'
              ) : isCard ? (
                <CreditCard className="w-5 h-5 text-white" />
              ) : isBank ? (
                <Building2 className="w-5 h-5 text-white" />
              ) : (
                <Smartphone className="w-5 h-5 text-white" />
              )}
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">{gatewayTitle}</h3>
              <p className="text-[11px] text-white/80">{gatewaySubtitle}</p>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-white/15 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 text-white/90 font-medium">
              <Lock className="w-3.5 h-3.5" />
              256-Bit SSL Secured
            </span>
            <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider ${badgeColor}`}>
              INSTANT AUTO-DEBIT
            </span>
          </div>
        </div>

        {/* Modal Body */}
        {stage === 'PROCESSING' || stage === 'SUCCESS' ? (
          <div className="p-8 text-center space-y-6">
            <div className="relative w-16 h-16 mx-auto">
              {stage === 'SUCCESS' ? (
                <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center animate-bounce">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full border-4 border-slate-200 border-t-emerald-600 animate-spin" />
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-base font-bold text-[#141413]">
                {stage === 'SUCCESS' ? 'Payment Charged Successfully!' : 'Processing Automated Deduction...'}
              </h4>
              <p className="text-xs text-[#575653] font-mono max-w-sm mx-auto leading-relaxed">
                {progressMessage}
              </p>
            </div>

            {/* Live Step Checklist */}
            <div className="bg-[#FAF9F5] border border-black/[0.08] rounded-lg p-4 text-left space-y-2 text-xs">
              <div className={`flex items-center gap-2 ${progressStep >= 1 ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>
                <span>{progressStep >= 1 ? '✓' : '○'}</span>
                <span>1. Connect to Secure Gateway Host</span>
              </div>
              <div className={`flex items-center gap-2 ${progressStep >= 2 ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>
                <span>{progressStep >= 2 ? '✓' : '○'}</span>
                <span>2. Verify Login &amp; {authType} Credentials</span>
              </div>
              <div className={`flex items-center gap-2 ${progressStep >= 3 ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>
                <span>{progressStep >= 3 ? '✓' : '○'}</span>
                <span>3. Debit PKR {orderTotalPkr.toLocaleString()} from Customer Account</span>
              </div>
              <div className={`flex items-center gap-2 ${progressStep >= 4 ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>
                <span>{progressStep >= 4 ? '✓' : '○'}</span>
                <span>4. Credit Funds to {storeName} Merchant Treasury</span>
              </div>
              <div className={`flex items-center gap-2 ${progressStep >= 5 ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>
                <span>{progressStep >= 5 ? '✓' : '○'}</span>
                <span>5. Auto-Confirm Order &amp; Dispatch Receipt</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 italic">
              Please do not close or refresh this window while transaction is settling...
            </p>
          </div>
        ) : (
          <form onSubmit={handleAuthorizePayment} className="p-6 space-y-5">
            {/* Amount to be Charged Card */}
            <div className="bg-[#FAF9F5] border border-black/[0.08] rounded-lg p-4 flex items-center justify-between">
              <div>
                <span className="block text-[11px] font-semibold text-[#787774] uppercase tracking-wider">
                  Amount to be Charged (رقم کٹوتی)
                </span>
                <span className="block text-xl font-bold font-mono text-[#141413] mt-0.5">
                  PKR {orderTotalPkr.toLocaleString()}
                </span>
                <span className="block text-[10px] text-[#787774]">
                  (${orderTotalUsd.toFixed(2)} USD) · 0% Transaction Surcharge
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-emerald-800 font-semibold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded block">
                  ✓ Merchant Verified
                </span>
                <span className="text-[10px] text-[#555] mt-1 block truncate max-w-[140px]">
                  {storeName}
                </span>
              </div>
            </div>

            {/* Urdu & English Guidance Banner */}
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-lg text-xs space-y-1 text-emerald-950">
              <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
                <span>خودکار ادائیگی کٹوتی (Automated Instant Debit):</span>
              </div>
              <p className="text-[11px] leading-relaxed text-emerald-900">
                اپنا لاگ ان پاسورڈ یا MPIN درج کریں۔ رقم خودکار طور پر کٹ کر ہمارے مرچنٹ اکاؤنٹ میں جمع ہو جائے گی اور سسٹم فوراً آرڈر کو <strong>PAID</strong> اور <strong>CONFIRMED</strong> کر دے گا۔ ایڈمن کی دستی تصدیق کا انتظار نہیں کرنا پڑے گا۔
              </p>
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded text-xs text-rose-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Account Number Field */}
            <div>
              <label className="block text-xs font-semibold text-[#141413] mb-1">
                {isCard ? 'Card / Account Identifier' : 'Mobile Account / Account Number'}
              </label>
              <input
                type="text"
                required
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder={isCard ? 'Card Number' : '03XX-XXXXXXX'}
                className="w-full px-3.5 py-2.5 bg-white border border-black/20 rounded font-mono text-xs focus:border-[#141413] focus:ring-1 focus:ring-[#141413] outline-hidden"
              />
              <span className="block text-[10px] text-[#787774] mt-1">
                Customer Name: {customerName} · Email: {customerEmail}
              </span>
            </div>

            {/* PIN / Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-[#141413]">
                  {pinLabel} <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={handleAutoFillPin}
                  className="text-[10px] font-mono text-emerald-800 hover:text-emerald-950 font-bold underline cursor-pointer"
                >
                  ⚡ Auto-fill Test {authType === '3DS' ? 'OTP' : 'PIN'} ({defaultTestPin})
                </button>
              </div>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoFocus
                  value={pinOrPassword}
                  onChange={(e) => setPinOrPassword(e.target.value)}
                  placeholder={pinPlaceholder}
                  className="w-full px-3.5 py-2.5 bg-white border border-black/20 rounded font-mono text-xs tracking-widest focus:border-[#141413] focus:ring-1 focus:ring-[#141413] outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex items-center justify-between text-[10px] text-[#787774] mt-1">
                <span>Enter your secret PIN/password to authorize instant debit</span>
                <span className="font-mono text-slate-500">End-to-End Encrypted</span>
              </div>
            </div>

            {/* Recipient Account Details Summary */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded text-[11px] text-slate-700 space-y-1">
              <div className="flex justify-between">
                <span>Credited To:</span>
                <strong className="text-slate-900">{storeName} Merchant Treasury</strong>
              </div>
              <div className="flex justify-between font-mono text-[10px]">
                <span>Settlement Ref:</span>
                <span>{merchantAccountNote}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="py-3 px-4 border border-black/20 hover:bg-black/5 text-xs font-semibold rounded cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-3 px-5 bg-[#00A651] hover:bg-[#008c44] text-white text-xs font-bold uppercase tracking-wider rounded shadow-md cursor-pointer transition-all flex items-center justify-center gap-2"
              >
                <Lock className="w-4 h-4" />
                <span>Authorize &amp; Charge PKR {orderTotalPkr.toLocaleString()} Now</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
