
import React from 'react';
import { AlertOctagon, X, FileQuestion, AlertTriangle, ArrowRight } from 'lucide-react';

interface InvalidFileModalProps {
  isOpen: boolean;
  fileName: string;
  reason: string;
  onClose: () => void;
  // Mismatch-specific props (optional)
  type?: 'invalid' | 'mismatch';
  currentSection?: string;
  detectedType?: string;
  targetSectionName?: string;
  onConfirm?: () => void;
}

const InvalidFileModal: React.FC<InvalidFileModalProps> = ({ 
  isOpen,
  fileName, 
  reason, 
  onClose,
  type = 'invalid',
  currentSection,
  detectedType,
  targetSectionName,
  onConfirm
}) => {
  const isMismatch = type === 'mismatch';
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className={`bg-white dark:bg-slate-800 p-8 rounded-xl shadow-2xl border-2 max-w-md w-full text-center relative ${
        isMismatch ? 'border-orange-400' : 'border-red-400'
      }`}>
        {!isMismatch && (
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-slate-400 hover:text-red-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
          isMismatch 
            ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600' 
            : 'bg-red-50 dark:bg-red-900/20 text-red-500'
        }`}>
          {isMismatch ? <AlertTriangle className="w-8 h-8" /> : <AlertOctagon className="w-8 h-8" />}
        </div>
        
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          {isMismatch ? 'Document Type Mismatch' : 'Invalid File Uploaded'}
        </h3>
        
        {isMismatch ? (
          <p className="text-slate-500 dark:text-slate-300 text-sm leading-relaxed mb-6">
            You uploaded <span className="font-semibold text-slate-800 dark:text-slate-200">{fileName}</span> in the{' '}
            <span className="font-semibold text-slate-800 dark:text-slate-200">{currentSection}</span> section, 
            but our AI detected it as a <span className="font-bold text-slate-800 dark:text-slate-200">{detectedType}</span>.
            <br /><br />
            Would you like to move it to the {targetSectionName}?
          </p>
        ) : (
          <>
            <div className="bg-slate-50 dark:bg-slate-700/50 p-3 rounded-lg my-4 flex items-center justify-center gap-2">
              <FileQuestion className="w-4 h-4 text-slate-500" />
              <span className="font-mono text-sm text-slate-700 dark:text-slate-300 truncate max-w-[200px]">{fileName}</span>
            </div>

            <p className="text-slate-600 dark:text-slate-300 text-sm mb-6 leading-relaxed">
              {reason}
            </p>
          </>
        )}

        <div className="flex flex-col gap-3">
          {isMismatch ? (
            <>
              <button
                onClick={onConfirm}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-lg shadow-indigo-500/20 transition-all flex items-center justify-center gap-2 group"
              >
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                Move to {targetSectionName?.replace(' processor', '')}
              </button>
              <button
                onClick={onClose}
                className="w-full py-3 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors text-sm font-medium"
              >
                Cancel (Terminate)
              </button>
            </>
          ) : (
            <>
              <div className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700">
                Please only upload <strong>Invoices</strong> (PDF/Image) or <strong>Bank Statements</strong>. 
                Other documents are not supported.
              </div>
              
              <button 
                onClick={onClose}
                className="mt-2 w-full py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-md transition-colors"
              >
                Close
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default InvalidFileModal;
