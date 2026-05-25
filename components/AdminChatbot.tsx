import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Send, X, Minimize2, Maximize2, Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { supabase } from '../services/supabase';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    queryResults?: { query_index: number; table: string; count: number; error?: string }[];
    isError?: boolean;
}

interface AdminChatbotProps {
    isOpen: boolean;
    onToggle: () => void;
}

const SUGGESTED_QUESTIONS = [
    "How many users haven't recharged in 30 days?",
    "Show me areas with outage complaints",
    "Which users have the highest energy consumption?",
    "How many users are on prepaid vs postpaid?",
    "Show me users with low balance (below ₹100)",
    "What's the most common appliance category?",
];

const AdminChatbot: React.FC<AdminChatbotProps> = ({ isOpen, onToggle }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([{
        id: 'welcome',
        role: 'assistant',
        content: "Hi! I'm the VoltWise Admin AI. Ask me anything about your users, billing, recharges, outages, or energy data. I can query the database and give you real answers.\n\nTry asking questions like:\n- \"How many users haven't recharged in 30 days?\"\n- \"Show me which areas have outage complaints\"\n- \"What's the average balance across all meters?\"",
        timestamp: new Date(),
    }]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    useEffect(() => {
        if (isOpen) inputRef.current?.focus();
    }, [isOpen]);

    const sendMessage = async (text?: string) => {
        const messageText = (text || input).trim();
        if (!messageText || isLoading) return;

        const userMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: messageText,
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        try {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData?.session?.access_token;

            if (!token) {
                throw new Error('Not authenticated. Please log in again.');
            }

            // Build conversation history for context
            const history = messages.slice(-6).map(m => ({
                role: m.role,
                content: m.content,
            }));

            const response = await fetch('/api/admin/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    message: messageText,
                    conversation_history: history,
                }),
            });

            if (!response.ok) {
                const errBody = await response.json().catch(() => ({ detail: response.statusText }));
                throw new Error(errBody.detail || `Error ${response.status}`);
            }

            const data = await response.json();

            const assistantMsg: ChatMessage = {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: data.reply || 'No response received.',
                timestamp: new Date(),
                queryResults: data.query_results || undefined,
                isError: !!data.error,
            };

            setMessages(prev => [...prev, assistantMsg]);
        } catch (err: any) {
            const errorMsg: ChatMessage = {
                id: `error-${Date.now()}`,
                role: 'assistant',
                content: `⚠️ ${err.message || 'Something went wrong. Please try again.'}`,
                timestamp: new Date(),
                isError: true,
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    if (!isOpen) return null;

    const chatWidth = isExpanded ? 'w-[700px]' : 'w-[420px]';
    const chatHeight = isExpanded ? 'h-[600px]' : 'h-[500px]';

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className={`fixed bottom-6 right-6 ${chatWidth} ${chatHeight} bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden z-50`}
            >
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                            <Sparkles className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h3 className="text-white font-semibold text-sm">VoltWise AI</h3>
                            <p className="text-indigo-200 text-[10px]">Admin Assistant • Database-powered</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                        >
                            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={onToggle}
                            className="p-1.5 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                    {messages.map(msg => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] ${
                                msg.role === 'user'
                                    ? 'bg-indigo-600 text-white rounded-2xl rounded-tr-md'
                                    : msg.isError
                                        ? 'bg-red-50 text-red-800 border border-red-200 rounded-2xl rounded-tl-md'
                                        : 'bg-slate-100 text-slate-800 rounded-2xl rounded-tl-md'
                            } px-4 py-2.5 text-sm`}>
                                {msg.role === 'assistant' && (
                                    <div className="flex items-center gap-1.5 mb-1.5">
                                        {msg.isError ? (
                                            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                                        ) : (
                                            <Bot className="w-3.5 h-3.5 text-indigo-500" />
                                        )}
                                        <span className={`text-[10px] font-semibold ${msg.isError ? 'text-red-500' : 'text-indigo-500'}`}>
                                            VoltWise AI
                                        </span>
                                    </div>
                                )}
                                <div className="whitespace-pre-wrap leading-relaxed text-[13px]">
                                    {formatMarkdown(msg.content)}
                                </div>
                                {msg.queryResults && msg.queryResults.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-slate-200/50">
                                        <p className="text-[10px] text-slate-400 font-medium mb-1">Queried tables:</p>
                                        <div className="flex flex-wrap gap-1">
                                            {msg.queryResults.map((qr, i) => (
                                                <span key={i} className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                                                    qr.error ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'
                                                }`}>
                                                    {qr.table} ({qr.count})
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="bg-slate-100 rounded-2xl rounded-tl-md px-4 py-3 text-sm">
                                <div className="flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                                    <span className="text-slate-500 text-xs">Querying database...</span>
                                </div>
                            </div>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>

                {/* Suggested Questions (only show when few messages) */}
                {messages.length <= 2 && !isLoading && (
                    <div className="px-4 py-2 border-t border-slate-100 flex-shrink-0">
                        <p className="text-[10px] text-slate-400 font-medium mb-1.5">Suggested questions:</p>
                        <div className="flex flex-wrap gap-1.5">
                            {SUGGESTED_QUESTIONS.slice(0, 4).map((q, i) => (
                                <button
                                    key={i}
                                    onClick={() => sendMessage(q)}
                                    className="text-[11px] px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors border border-indigo-100 truncate max-w-[200px]"
                                >
                                    {q}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Input */}
                <div className="px-4 py-3 border-t border-slate-200 flex items-center gap-2 flex-shrink-0 bg-white">
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about users, billing, outages..."
                        className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all placeholder:text-slate-400"
                        disabled={isLoading}
                    />
                    <button
                        onClick={() => sendMessage()}
                        disabled={!input.trim() || isLoading}
                        className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};

/** Simple markdown-like formatter for bold text and bullet points */
function formatMarkdown(text: string): React.ReactNode {
    const lines = text.split('\n');
    return lines.map((line, i) => {
        // Bold: **text** → <strong>text</strong>
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        const formatted = parts.map((part, j) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={j}>{part.slice(2, -2)}</strong>;
            }
            return part;
        });
        return (
            <React.Fragment key={i}>
                {i > 0 && <br />}
                {formatted}
            </React.Fragment>
        );
    });
}

export default AdminChatbot;
