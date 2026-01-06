import React from 'react';
import { AlertTriangle, Crown, Settings, X } from 'lucide-react';

interface TokenLimitModalProps {
    isOpen: boolean;
    onClose: () => void;
    onOpenSettings: () => void;
    plan: string;
    used: number;
    limit: number;
}

const TokenLimitModal: React.FC<TokenLimitModalProps> = ({ isOpen, onClose, onOpenSettings, plan, used, limit }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border-2 border-orange-200 dark:border-orange-900 w-full max-w-md overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-orange-200 dark:border-orange-900 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-orange-500 rounded-xl">
                            <AlertTriangle className="w-8 h-8 text-white" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-xl text-slate-900 dark:text-white flex items-center gap-2">
                                Token Limit Reached!
                            </h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                                You've reached your monthly token limit
                            </p>
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    {/* Usage Stats */}
                    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm text-slate-600 dark:text-slate-400">Current Plan</span>
                            <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1">
                                <Crown className="w-4 h-4 text-orange-500" />
                                {plan}
                            </span>
                        </div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm text-slate-600 dark:text-slate-400">Tokens Used</span>
                            <span className="font-bold text-orange-600 dark:text-orange-400">
                                {used} / {limit}
                            </span>
                        </div>
                        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                            <div className="h-2 rounded-full bg-orange-500 w-full" />
                        </div>
                    </div>

                    {/* Message */}
                    <div className="text-center space-y-2">
                        <p className="text-slate-700 dark:text-slate-300 text-sm">
                            You've used all {limit} tokens on your <strong>{plan}</strong> plan this month.
                        </p>
                        <p className="text-slate-600 dark:text-slate-400 text-sm">
                            To continue using AI features, you can:
                        </p>
                    </div>

                    {/* Options */}
                    <div className="space-y-3">
                        <div className="flex items-start gap-3 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800">
                            <Crown className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5" />
                            <div className="flex-1">
                                <p className="font-bold text-indigo-900 dark:text-indigo-300 text-sm">Upgrade Your Plan</p>
                                <p className="text-xs text-indigo-700 dark:text-indigo-400 mt-1">
                                    Get more tokens monthly by upgrading to Gold (100,000) or Platinum (200,000)
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
                            <Settings className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mt-0.5" />
                            <div className="flex-1">
                                <p className="font-bold text-emerald-900 dark:text-emerald-300 text-sm">Reset Token Usage</p>
                                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                                    Reset your counter to 0 in Settings (keeps your current plan)
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-medium text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                        >
                            Close
                        </button>
                        <button
                            onClick={() => {
                                onClose();
                                onOpenSettings();
                            }}
                            className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                        >
                            <Settings className="w-4 h-4" />
                            Open Settings
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TokenLimitModal;
