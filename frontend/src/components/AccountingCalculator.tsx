
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, History, Delete, Calculator as CalcIcon } from 'lucide-react';

interface CalculatorProps {
  onClose: () => void;
}

const AccountingCalculator: React.FC<CalculatorProps> = ({ onClose }) => {
  const [display, setDisplay] = useState('0');
  const [history, setHistory] = useState<string[]>([]);
  const [expression, setExpression] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  // Helper to format numbers with commas for Indian locale
  const formatNum = (numStr: string) => {
    if (!numStr || numStr === 'Error') return numStr;
    const num = parseFloat(numStr);
    if (isNaN(num)) return numStr;
    return num.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  };

  const handleNumber = (num: string) => {
    setDisplay(prev => (prev === '0' || prev === 'Error') ? num : prev + num);
  };

  const handleOperator = (op: string) => {
    setExpression(display + ' ' + op + ' ');
    setDisplay('0');
  };

  const handleDecimal = () => {
    if (!display.includes('.')) {
      setDisplay(prev => prev + '.');
    }
  };

  const handleClear = () => {
    setDisplay('0');
    setExpression('');
  };

  const handleBackspace = () => {
    setDisplay(prev => {
      if (prev.length === 1 || prev === 'Error') return '0';
      return prev.slice(0, -1);
    });
  };

  const safeEvaluate = (expression: string): number => {
    // Remove all whitespace
    const expr = expression.replace(/\s+/g, '');
    if (!expr) return 0;

    // Check for invalid characters (security check)
    if (/[^0-9+\-*/().]/.test(expr)) return 0;

    // Tokenizer
    const tokens: string[] = [];
    let numberBuffer = '';

    for (let i = 0; i < expr.length; i++) {
      const char = expr[i];
      if (/[0-9.]/.test(char)) {
        numberBuffer += char;
      } else {
        if (numberBuffer) {
          tokens.push(numberBuffer);
          numberBuffer = '';
        }
        tokens.push(char);
      }
    }
    if (numberBuffer) tokens.push(numberBuffer);

    // Parser (Recursive Descent)
    let pos = 0;

    const parseFactor = (): number => {
      if (pos >= tokens.length) return 0;
      const token = tokens[pos];

      if (token === '(') {
        pos++;
        const result = parseExpression();
        pos++; // consume ')'
        return result;
      }

      pos++;
      return parseFloat(token);
    };

    const parseTerm = (): number => {
      let result = parseFactor();
      while (pos < tokens.length && (tokens[pos] === '*' || tokens[pos] === '/')) {
        const op = tokens[pos];
        pos++;
        const right = parseFactor();
        if (op === '*') result *= right;
        else if (right !== 0) result /= right;
      }
      return result;
    };

    const parseExpression = (): number => {
      let result = parseTerm();
      while (pos < tokens.length && (tokens[pos] === '+' || tokens[pos] === '-')) {
        const op = tokens[pos];
        pos++;
        const right = parseTerm();
        if (op === '+') result += right;
        else result -= right;
      }
      return result;
    };

    return parseExpression();
  };

  const calculate = () => {
    try {
      const fullExp = expression + display;
      // Sanitize expression to only allow numbers and operators
      const sanitizedExp = fullExp.replace(/x/g, '*').replace(/[^-()\d/*+.]/g, '');

      const result = safeEvaluate(sanitizedExp);
      const resultStr = parseFloat(result.toFixed(2)).toString();

      addToHistory(`${fullExp} = ${resultStr}`);
      setDisplay(resultStr);
      setExpression('');
    } catch (e) {
      setDisplay('Error');
    }
  };

  const calculateTax = (rate: number, type: 'add' | 'remove') => {
    const current = parseFloat(display);
    if (isNaN(current)) return;

    let result = 0;
    let desc = '';

    if (type === 'add') {
      // Add Tax: Value + (Value * Rate / 100)
      const taxAmount = current * (rate / 100);
      result = current + taxAmount;
      desc = `${current} + ${rate}% GST`;
    } else {
      // Remove Tax (Reverse): Value / (1 + Rate / 100) -> Finds Base Amount
      // Logic: If 118 is total, base is 100.
      const base = current / (1 + (rate / 100));
      result = base;
      desc = `${current} - ${rate}% GST (Base)`;
    }

    const resultStr = parseFloat(result.toFixed(2)).toString();
    addToHistory(`${desc} = ${resultStr}`);
    setDisplay(resultStr);
  };

  const addToHistory = (entry: string) => {
    setHistory(prev => [entry, ...prev].slice(0, 20));
  };

  return createPortal(
    <div className="fixed bottom-4 right-4 z-[9999] w-80 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-fade-in flex flex-col font-sans">
      {/* Header */}
      <div className="bg-slate-50 dark:bg-slate-900/50 p-3 flex justify-between items-center border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold text-sm">
          <CalcIcon className="w-4 h-4" />
          Accounting Calculator
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`p-1.5 rounded-md transition-colors ${showHistory ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
            title="History"
          >
            <History className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Display */}
      <div className="bg-slate-100 dark:bg-slate-900 p-4 text-right flex flex-col justify-end h-24">
        <div className="text-xs text-slate-400 h-4">{expression}</div>
        <div className="text-3xl font-mono font-bold text-slate-800 dark:text-white truncate">
          {formatNum(display)}
        </div>
      </div>

      {/* History Overlay */}
      {showHistory && (
        <div className="bg-slate-50 dark:bg-slate-800 absolute top-28 bottom-0 left-0 right-0 z-10 p-2 overflow-y-auto border-t border-slate-200 dark:border-slate-700 h-[calc(100%-7rem)]">
          {history.length === 0 && <p className="text-center text-xs text-slate-400 mt-4">No history yet</p>}
          {history.map((h, i) => (
            <div key={i} className="text-right p-2 text-xs font-mono border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
              {h}
            </div>
          ))}
        </div>
      )}

      {/* Keypad */}
      <div className="p-2 grid grid-cols-4 gap-2 bg-white dark:bg-slate-800">
        {/* Row 1 */}
        <button onClick={handleClear} className="col-span-1 p-3 text-red-500 font-bold bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 text-sm">C</button>
        <button onClick={handleBackspace} className="p-3 text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200"><Delete className="w-4 h-4 mx-auto" /></button>
        <button onClick={() => handleOperator('/')} className="p-3 text-indigo-600 font-bold bg-indigo-50 dark:bg-indigo-900/20 rounded-lg hover:bg-indigo-100 text-sm">/</button>
        <button onClick={() => handleOperator('*')} className="p-3 text-indigo-600 font-bold bg-indigo-50 dark:bg-indigo-900/20 rounded-lg hover:bg-indigo-100 text-sm">*</button>

        {/* Row 2 */}
        <button onClick={() => handleNumber('7')} className="p-3 text-slate-800 dark:text-white font-semibold bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-slate-100 text-sm">7</button>
        <button onClick={() => handleNumber('8')} className="p-3 text-slate-800 dark:text-white font-semibold bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-slate-100 text-sm">8</button>
        <button onClick={() => handleNumber('9')} className="p-3 text-slate-800 dark:text-white font-semibold bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-slate-100 text-sm">9</button>
        <button onClick={() => handleOperator('-')} className="p-3 text-indigo-600 font-bold bg-indigo-50 dark:bg-indigo-900/20 rounded-lg hover:bg-indigo-100 text-sm">-</button>

        {/* Row 3 */}
        <button onClick={() => handleNumber('4')} className="p-3 text-slate-800 dark:text-white font-semibold bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-slate-100 text-sm">4</button>
        <button onClick={() => handleNumber('5')} className="p-3 text-slate-800 dark:text-white font-semibold bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-slate-100 text-sm">5</button>
        <button onClick={() => handleNumber('6')} className="p-3 text-slate-800 dark:text-white font-semibold bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-slate-100 text-sm">6</button>
        <button onClick={() => handleOperator('+')} className="p-3 text-indigo-600 font-bold bg-indigo-50 dark:bg-indigo-900/20 rounded-lg hover:bg-indigo-100 text-sm">+</button>

        {/* Row 4 */}
        <button onClick={() => handleNumber('1')} className="p-3 text-slate-800 dark:text-white font-semibold bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-slate-100 text-sm">1</button>
        <button onClick={() => handleNumber('2')} className="p-3 text-slate-800 dark:text-white font-semibold bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-slate-100 text-sm">2</button>
        <button onClick={() => handleNumber('3')} className="p-3 text-slate-800 dark:text-white font-semibold bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-slate-100 text-sm">3</button>
        <button onClick={calculate} className="row-span-2 p-3 text-white font-bold bg-emerald-500 rounded-lg hover:bg-emerald-600 flex items-center justify-center text-lg">=</button>

        {/* Row 5 */}
        <button onClick={() => handleNumber('0')} className="col-span-2 p-3 text-slate-800 dark:text-white font-semibold bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-slate-100 text-sm">0</button>
        <button onClick={handleDecimal} className="p-3 text-slate-800 dark:text-white font-semibold bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-slate-100 text-sm">.</button>
      </div>

      {/* GST Shortcuts */}
      <div className="p-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30">
        <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1 px-1">
          <span>ADD TAX (+GST)</span>
          <span>REVERSE TAX (-GST)</span>
        </div>

        {/* Clean Grid Layout */}
        <div className="grid grid-cols-5 gap-1 mt-1">
          <button onClick={() => calculateTax(5, 'add')} className="py-1 bg-green-50 text-green-700 text-[10px] font-bold rounded border border-green-200 hover:bg-green-100">+5%</button>
          <button onClick={() => calculateTax(12, 'add')} className="py-1 bg-green-50 text-green-700 text-[10px] font-bold rounded border border-green-200 hover:bg-green-100">+12%</button>
          <button onClick={() => calculateTax(5, 'remove')} className="py-1 bg-orange-50 text-orange-700 text-[10px] font-bold rounded border border-orange-200 hover:bg-orange-100">-5%</button>
          <button onClick={() => calculateTax(12, 'remove')} className="py-1 bg-orange-50 text-orange-700 text-[10px] font-bold rounded border border-orange-200 hover:bg-orange-100">-12%</button>
          <button onClick={() => calculateTax(40, 'add')} className="py-1 bg-green-50 text-green-700 text-[10px] font-bold rounded border border-green-200 hover:bg-green-100">+40%</button>

          <button onClick={() => calculateTax(18, 'add')} className="py-1 bg-green-50 text-green-700 text-[10px] font-bold rounded border border-green-200 hover:bg-green-100">+18%</button>
          <button onClick={() => calculateTax(28, 'add')} className="py-1 bg-green-50 text-green-700 text-[10px] font-bold rounded border border-green-200 hover:bg-green-100">+28%</button>
          <button onClick={() => calculateTax(18, 'remove')} className="py-1 bg-orange-50 text-orange-700 text-[10px] font-bold rounded border border-orange-200 hover:bg-orange-100">-18%</button>
          <button onClick={() => calculateTax(28, 'remove')} className="py-1 bg-orange-50 text-orange-700 text-[10px] font-bold rounded border border-orange-200 hover:bg-orange-100">-28%</button>
          <button onClick={() => calculateTax(40, 'remove')} className="py-1 bg-orange-50 text-orange-700 text-[10px] font-bold rounded border border-orange-200 hover:bg-orange-100">-40%</button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default AccountingCalculator;
