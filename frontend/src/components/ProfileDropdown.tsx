import React, { useState, useRef, useEffect } from 'react';
import { User, ChevronDown, Coins, Crown, Award, Medal, Check } from 'lucide-react';
import { TokenUsageData, setPlan } from '../services/backendService';
import { BACKEND_API_KEY } from '../constants';

interface ProfileDropdownProps {
    userName: string;
    tokenData: TokenUsageData | null;
    onRefreshTokenData: () => void;
}

const PLAN_ICONS = {
    Bronze: Medal,
    Gold: Award,
    Platinum: Crown
};

const PLAN_COLORS = {
    Bronze: 'text-orange-400',
    Gold: 'text-yellow-400',
    Platinum: 'text-cyan-400'
};

const ProfileDropdown: React.FC<ProfileDropdownProps> = ({ userName, tokenData, onRefreshTokenData }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isChangingPlan, setIsChangingPlan] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setIsChangingPlan(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handlePlanChange = async (plan: string) => {
        const success = await setPlan(BACKEND_API_KEY, plan);
        if (success) {
            onRefreshTokenData();
            setIsChangingPlan(false);
        }
    };

    // Calculate usage percentage color
    const getUsageColor = (percentage: number) => {
        if (percentage >= 100) return 'bg-red-500';
        if (percentage >= 75) return 'bg-orange-500';
        if (percentage >= 50) return 'bg-yellow-500';
        return 'bg-emerald-500';
    };

    const getUsageTextColor = (percentage: number) => {
        if (percentage >= 100) return 'text-red-400';
        if (percentage >= 75) return 'text-orange-400';
        if (percentage >= 50) return 'text-yellow-400';
        return 'text-emerald-400';
    };

    const PlanIcon = tokenData ? PLAN_ICONS[tokenData.plan] : Medal;

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white"
                title="Profile & Token Usage"
            >
                <div className="w-7 h-7 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {userName ? userName.charAt(0).toUpperCase() : <User className="w-4 h-4" />}
                </div>
                <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full right-0 mt-2 w-72 bg-[#1e293b] border border-slate-700 rounded-xl shadow-2xl z-[999] overflow-hidden animate-fade-in">
                    {/* Header */}
                    <div className="p-4 border-b border-slate-700/50 bg-slate-800/50">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                                {userName ? userName.charAt(0).toUpperCase() : 'U'}
                            </div>
                            <div>
                                <p className="text-sm font-bold text-white">{userName || 'User'}</p>
                                <div className="flex items-center gap-1.5">
                                    <PlanIcon className={`w-3.5 h-3.5 ${tokenData ? PLAN_COLORS[tokenData.plan] : 'text-slate-400'}`} />
                                    <span className={`text-xs font-semibold ${tokenData ? PLAN_COLORS[tokenData.plan] : 'text-slate-400'}`}>
                                        {tokenData?.plan || 'Bronze'} Plan
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Token Usage */}
                    <div className="p-4">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Coins className="w-3.5 h-3.5" /> Token Usage
                            </span>
                            <span className={`text-xs font-bold ${getUsageTextColor(tokenData?.percentage || 0)}`}>
                                {tokenData?.percentage?.toFixed(1) || 0}%
                            </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden mb-2">
                            <div
                                className={`h-full ${getUsageColor(tokenData?.percentage || 0)} transition-all duration-500`}
                                style={{ width: `${Math.min(tokenData?.percentage || 0, 100)}%` }}
                            />
                        </div>

                        <div className="flex justify-between text-xs">
                            <span className="text-slate-400">
                                <span className="text-white font-bold">{tokenData?.used || 0}</span> used
                            </span>
                            <span className="text-slate-400">
                                <span className="text-white font-bold">{tokenData?.limit?.toLocaleString() || '50,000'}</span> limit
                            </span>
                        </div>

                        {tokenData?.reset_date && (
                            <p className="text-[10px] text-slate-500 mt-2 text-center">
                                Resets: {tokenData.reset_date}
                            </p>
                        )}
                    </div>

                    {/* Plan Selection */}
                    <div className="p-4 border-t border-slate-700/50 bg-slate-800/30">
                        {isChangingPlan ? (
                            <div className="space-y-2">
                                <p className="text-xs font-bold text-slate-400 mb-2">Select Plan:</p>
                                {(['Bronze', 'Gold', 'Platinum'] as const).map((plan) => {
                                    const Icon = PLAN_ICONS[plan];
                                    const limits = { Bronze: 50000, Gold: 100000, Platinum: 200000 };
                                    const isActive = tokenData?.plan === plan;
                                    return (
                                        <button
                                            key={plan}
                                            onClick={() => handlePlanChange(plan)}
                                            className={`w-full flex items-center justify-between p-2 rounded-lg transition-colors ${isActive
                                                ? 'bg-indigo-600/20 border border-indigo-500/50'
                                                : 'hover:bg-slate-700/50 border border-transparent'
                                                }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                <Icon className={`w-4 h-4 ${PLAN_COLORS[plan]}`} />
                                                <span className="text-sm font-medium text-white">{plan}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-slate-400">{limits[plan].toLocaleString()} tokens</span>
                                                {isActive && <Check className="w-4 h-4 text-emerald-400" />}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <button
                                onClick={() => setIsChangingPlan(true)}
                                className="w-full py-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                            >
                                Change Plan
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProfileDropdown;
