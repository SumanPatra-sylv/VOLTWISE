import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, CreditCard, Wallet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../services/supabase';

// Razorpay type declaration
declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpayResponse) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayResponse {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
}

interface RazorpayInstance {
  open: () => void;
  close: () => void;
}

interface RechargeModalProps {
  isOpen: boolean;
  onClose: () => void;
  meterId: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  currentBalance: number;
  onSuccess?: (newBalance: number, rechargeAmount: number) => void;
}

const PRESET_AMOUNTS = [100, 200, 500, 1000, 2000];

const RechargeModal: React.FC<RechargeModalProps> = ({
  isOpen,
  onClose,
  meterId,
  userId,
  userName,
  userEmail,
  userPhone,
  currentBalance,
  onSuccess,
}) => {
  const [amount, setAmount] = useState<number>(500);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [newBalance, setNewBalance] = useState(0);

  const razorpayKeyId = import.meta.env.VITE_RAZORPAY_KEY_ID;

  const handleAmountSelect = (value: number) => {
    setAmount(value);
    setCustomAmount('');
    setError('');
  };

  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setCustomAmount(val);
    if (val && !isNaN(Number(val))) {
      setAmount(Number(val));
    }
    setError('');
  };

  const processPayment = async () => {
    if (amount < 10) {
      setError('Minimum recharge amount is ₹10');
      return;
    }

    if (!razorpayKeyId || razorpayKeyId === 'rzp_test_your_key_id') {
      setError('Razorpay is not configured. Add VITE_RAZORPAY_KEY_ID to .env.local');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Create recharge record in pending state
      const { data: recharge, error: insertErr } = await supabase
        .from('recharges')
        .insert({
          user_id: userId,
          meter_id: meterId,
          amount: amount,
          method: 'upi', // Will be determined by Razorpay
          status: 'pending',
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      // Initialize Razorpay checkout
      const options: RazorpayOptions = {
        key: razorpayKeyId,
        amount: amount * 100, // Razorpay expects paise
        currency: 'INR',
        name: 'VoltWise',
        description: `Recharge ₹${amount}`,
        prefill: {
          name: userName || '',
          email: userEmail || '',
          contact: userPhone || '',
        },
        theme: {
          color: '#0ea5e9',
        },
        handler: async (response: RazorpayResponse) => {
          // Payment successful - update database
          try {
            const calculatedNewBalance = currentBalance + amount;

            // Update recharge record with Razorpay details
            await supabase
              .from('recharges')
              .update({
                status: 'completed',
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                balance_after: calculatedNewBalance,
                paid_at: new Date().toISOString(),
              })
              .eq('id', recharge.id);

            // Update meter balance
            await supabase
              .from('meters')
              .update({
                balance_amount: calculatedNewBalance,
                last_recharge_amount: amount,
                last_recharge_date: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', meterId);

            // Create success notification
            await supabase.from('notifications').insert({
              user_id: userId,
              type: 'billing',
              title: 'Recharge Successful',
              message: `₹${amount} has been added to your meter. New balance: ₹${calculatedNewBalance}`,
              icon: 'zap',
              color: 'text-emerald-500',
              bg_color: 'bg-emerald-50',
            });

            setNewBalance(calculatedNewBalance);
            setSuccess(true);
            setLoading(false);

            if (onSuccess) {
              onSuccess(calculatedNewBalance, amount);
            }
          } catch (err) {
            console.error('Failed to update balance:', err);
            setError('Payment received but failed to update balance. Contact support.');
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => {
            // User closed Razorpay modal without paying
            supabase
              .from('recharges')
              .update({ status: 'failed' })
              .eq('id', recharge.id);
            setLoading(false);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err: any) {
      console.error('Recharge error:', err);
      setError(err.message || 'Failed to initiate payment');
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setSuccess(false);
      setError('');
      setAmount(500);
      setCustomAmount('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        >
          <div className="p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-primary" fill="currentColor" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">Recharge Meter</h2>
              </div>
              <button
                onClick={handleClose}
                disabled={loading}
                className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-50"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            {success ? (
              // Success state
              <div className="text-center py-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4"
                >
                  <CheckCircle className="w-10 h-10 text-emerald-500" />
                </motion.div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Recharge Successful!</h3>
                <p className="text-slate-500 mb-4">₹{amount} has been added to your meter</p>
                <div className="bg-emerald-50 rounded-2xl p-4 mb-6">
                  <p className="text-sm text-emerald-600 font-medium">New Balance</p>
                  <p className="text-3xl font-bold text-emerald-700">₹{newBalance.toFixed(2)}</p>
                </div>
                <button
                  onClick={handleClose}
                  className="w-full py-3 bg-primary text-white font-bold rounded-xl"
                >
                  Done
                </button>
              </div>
            ) : (
              // Recharge form
              <>
                {/* Current Balance */}
                <div className="bg-slate-50 rounded-2xl p-4 mb-6">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-sm text-slate-500">Current Balance</p>
                      <p className="text-2xl font-bold text-slate-800">₹{currentBalance.toFixed(2)}</p>
                    </div>
                    <Wallet className="w-8 h-8 text-slate-300" />
                  </div>
                </div>

                {/* Preset Amounts */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Select Amount
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {PRESET_AMOUNTS.map((preset) => (
                      <button
                        key={preset}
                        onClick={() => handleAmountSelect(preset)}
                        className={`py-3 rounded-xl font-bold transition-all ${
                          amount === preset && !customAmount
                            ? 'bg-primary text-white shadow-lg shadow-primary/30'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        ₹{preset}
                      </button>
                    ))}
                    {/* Custom amount slot */}
                    <div className="col-span-3">
                      <input
                        type="number"
                        value={customAmount}
                        onChange={handleCustomAmountChange}
                        placeholder="Enter custom amount"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/50 text-center font-medium"
                      />
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-slate-50 rounded-2xl p-4 mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-500">Recharge Amount</span>
                    <span className="font-bold text-slate-800">₹{amount}</span>
                  </div>
                  <div className="flex justify-between items-center text-emerald-600">
                    <span>New Balance</span>
                    <span className="font-bold">₹{(currentBalance + amount).toFixed(2)}</span>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-center gap-2 text-rose-500 text-sm bg-rose-50 p-3 rounded-xl mb-4">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                {/* Pay Button */}
                <button
                  onClick={processPayment}
                  disabled={loading || amount < 10}
                  className="w-full py-4 bg-primary text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      Pay ₹{amount}
                    </>
                  )}
                </button>

                {/* Powered by Razorpay */}
                <p className="text-center text-xs text-slate-400 mt-4">
                  Secured by{' '}
                  <span className="font-medium text-slate-500">Razorpay</span>
                </p>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default RechargeModal;
