import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Play, Trash2, Code, Terminal, FileJson, AlertCircle, Home, ArrowRightLeft, X, Plus } from 'lucide-react';

import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

import { Lexer as PythonLexer } from '../language/python/lexer';
import { Parser as PythonParser } from '../language/python/parser';
import { JavaLexer } from '../language/java/lexer';
import { JavaParser } from '../language/java/parser';
import { CSPLexer } from '../language/csp/lexer';
import { CSPParser } from '../language/csp/parser';

import { Interpreter } from '../language/interpreter';
import { Translator } from '../language/translator';
import type { Program } from '../language/ast';
import { JSONTree } from '../components/JSONTree';

const SAMPLE_CODE_PYTHON = `x = 10
y = 5.5
name = "Praxly"

def check(val):
  if val > 8:
    return True
  else:
    return False

result = check(x)
print result
`;

const SAMPLE_CODE_JAVA = `public class Main {
  public static void main(String[] args) {
    int x = 10;
    System.out.println(x);
  }
}
`;

const SAMPLE_CODE_CSP = `x <- 10
DISPLAY(x)
IF (x > 5) {
  DISPLAY("Big")
}
`;

type SupportedLang = 'python' | 'java' | 'csp' | 'ast';

interface Panel {
    id: string;
    lang: SupportedLang;
    width: number;
}

export default function EditorPage() {
    const [code, setCode] = useState(SAMPLE_CODE_PYTHON);
    const [output, setOutput] = useState<string[]>([]);
    const [ast, setAst] = useState<Program | null>(null);
    const [sourceLang, setSourceLang] = useState<SupportedLang>('python');
    const [error, setError] = useState<string | null>(null);
    const [showAddMenu, setShowAddMenu] = useState(false);

    // Width for the left-most source editor
    const [editorWidth, setEditorWidth] = useState(window.innerWidth / 2);

    // Manage dynamic panels
    const [panels, setPanels] = useState<Panel[]>([]);

    // Resizing State
    const [resizingIdx, setResizingIdx] = useState<number | 'editor' | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Adaptive layout: Split space equally among editor + all open panels
    useEffect(() => {
        const totalItems = panels.length + 1;
        // Strip is w-16 (64px). We subtract it to get the net workspace width.
        const addStripWidth = 64;
        const totalAvailableWidth = window.innerWidth - addStripWidth;
        const equalWidth = totalAvailableWidth / totalItems;

        setEditorWidth(equalWidth);
        setPanels(prev => prev.map(p => ({ ...p, width: equalWidth })));
    }, [panels.length]);

    // --- Logic ---
    const parseCode = useCallback((lang: SupportedLang, input: string): Program | null => {
        if (lang === 'ast') return null;
        try {
            let tokens;
            let parser;
            switch (lang) {
                case 'java':
                    tokens = new JavaLexer(input).tokenize();
                    parser = new JavaParser(tokens);
                    return parser.parse();
                case 'csp':
                    tokens = new CSPLexer(input).tokenize();
                    parser = new CSPParser(tokens);
                    return parser.parse();
                case 'python':
                default:
                    tokens = new PythonLexer(input).tokenize();
                    parser = new PythonParser(tokens);
                    return parser.parse();
            }
        } catch (e: any) {
            throw new Error(e.message);
        }
    }, []);

    useEffect(() => {
        if (sourceLang !== 'ast') {
            try {
                const program = parseCode(sourceLang, code);
                setAst(program);
                setError(null);
            } catch (e: any) {
                setAst(null);
                setError(e.message);
            }
        }
    }, [code, sourceLang, parseCode]);

    const handleRun = () => {
        setError(null);
        setOutput([]);
        try {
            const runLang = sourceLang === 'ast' ? 'python' : sourceLang;
            const program = parseCode(runLang as SupportedLang, code);
            if (!program) return;
            setAst(program);

            const interpreter = new Interpreter();
            const results = interpreter.interpret(program);
            setOutput(results);
        } catch (e: any) {
            console.error(e);
            setError(e.message);
            setOutput((prev) => [...prev, `Error: ${e.message}`]);
        }
    };

    const handleClear = () => {
        setCode('');
        setAst(null);
        setOutput([]);
        setError(null);
    };

    const getTranslation = (target: SupportedLang) => {
        if (!ast) return "// Valid source code required...";
        if (target === 'ast') return JSON.stringify(ast, null, 2);

        const translator = new Translator();
        try {
            return translator.translate(ast, target as any);
        } catch (e) {
            return `// Translation to ${target} not available.`;
        }
    };

    const getExtensions = (lang: SupportedLang) => {
        switch (lang) {
            case 'java': return [java()];
            case 'python': return [python()];
            default: return [];
        }
    };

    // Panel Management
    const addPanel = (lang: SupportedLang) => {
        const id = window.crypto?.randomUUID ? window.crypto.randomUUID() : Math.random().toString(36).substring(7);
        setPanels([...panels, { id, lang, width: 350 }]);
        setShowAddMenu(false);
    };

    const removePanel = (id: string) => {
        setPanels(panels.filter(p => p.id !== id));
    };

    // Resize Handler
    const onMouseDown = (e: React.MouseEvent, index: number | 'editor') => {
        setResizingIdx(index);
        e.preventDefault();
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (resizingIdx === null) return;

            if (resizingIdx === 'editor') {
                setEditorWidth(prev => Math.max(150, prev + e.movementX));
            } else {
                setPanels(prev => {
                    const newPanels = [...prev];
                    const panel = newPanels[resizingIdx as number];
                    const newWidth = Math.max(100, panel.width + e.movementX);
                    newPanels[resizingIdx as number] = { ...panel, width: newWidth };
                    return newPanels;
                });
            }
        };

        const handleMouseUp = () => setResizingIdx(null);

        if (resizingIdx !== null) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [resizingIdx]);

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
            {/* Header */}
            <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 shadow-sm z-[200]">
                <div className="flex items-center gap-3">
                    <Link to="/" className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                        <Home size={20} />
                    </Link>
                    <div className="h-6 w-px bg-slate-800 mx-1" />
                    <div className="flex items-center gap-2">
                        <div className="bg-indigo-600 p-1.5 rounded-lg">
                            <Code size={20} className="text-white" />
                        </div>
                        <h1 className="font-bold text-lg text-slate-100 tracking-tight">Praxly <span className="text-indigo-400">2.0</span></h1>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button onClick={handleClear} className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors">
                        <Trash2 size={14} /> Clear
                    </button>
                    <button onClick={handleRun} className="flex items-center gap-2 px-4 py-1.5 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-md shadow-lg shadow-green-900/20 transition-all hover:translate-y-[-1px] active:translate-y-[1px]">
                        <Play size={16} fill="currentColor" /> Run Code
                    </button>
                </div>
            </header>

            <main className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 flex min-h-0 relative overflow-visible">
                    {/* Source Editor Panel */}
                    <div
                        className="flex shrink-0 relative group/editor z-[10]"
                        style={{ width: editorWidth }}
                    >
                        <div className="flex-1 flex flex-col border-r border-slate-800 overflow-hidden">
                            <div className="h-10 bg-slate-900 flex items-center justify-between px-4 border-b border-slate-800 text-[10px] font-bold uppercase tracking-widest text-slate-500 shrink-0">
                                <div className="flex items-center relative group h-full">
                                    <button className="flex items-center gap-2 py-2 text-indigo-400 hover:text-indigo-300 transition-colors uppercase">
                                        {sourceLang === 'ast' ? 'AST VIEW' : sourceLang}
                                        <ChevronDown size={12} />
                                    </button>
                                    <div className="absolute top-full left-0 w-40 bg-slate-800 border border-slate-700 hidden group-hover:block rounded-md shadow-xl overflow-hidden mt-1 z-[110]">
                                        <button onClick={() => { setSourceLang('python'); setCode(SAMPLE_CODE_PYTHON); }} className="block w-full text-left px-4 py-2 text-xs hover:bg-slate-700 transition-colors">Python</button>
                                        <button onClick={() => { setSourceLang('java'); setCode(SAMPLE_CODE_JAVA); }} className="block w-full text-left px-4 py-2 text-xs hover:bg-slate-700 transition-colors">Java</button>
                                        <button onClick={() => { setSourceLang('csp'); setCode(SAMPLE_CODE_CSP); }} className="block w-full text-left px-4 py-2 text-xs hover:bg-slate-700 transition-colors">AP CSP</button>
                                        <button onClick={() => { setSourceLang('ast'); }} className="block w-full text-left px-4 py-2 text-xs hover:bg-slate-700 transition-colors">AST View</button>
                                    </div>
                                </div>
                                <span>SOURCE</span>
                            </div>
                            <div className="flex-1 relative bg-slate-950 overflow-hidden">
                                <CodeMirror
                                    value={code}
                                    height="100%"
                                    theme={vscodeDark}
                                    extensions={getExtensions(sourceLang)}
                                    onChange={(val) => setCode(val)}
                                    className="text-sm h-full font-mono"
                                />
                            </div>
                        </div>
                        {/* Editor Resize Handle */}
                        <div
                            className={`absolute top-0 right-0 w-1 h-full cursor-col-resize z-[20] transition-colors ${resizingIdx === 'editor' ? 'bg-indigo-500' : 'bg-transparent hover:bg-indigo-500/30'}`}
                            onMouseDown={(e) => onMouseDown(e, 'editor')}
                        />
                    </div>

                    {/* Scrollable container for panels */}
                    <div className="flex-1 flex overflow-x-auto scrollbar-hide relative z-[10] bg-slate-900" ref={containerRef}>
                        {panels.map((panel, idx) => (
                            <div
                                key={panel.id}
                                className="flex shrink-0 border-r border-slate-800 last:border-0 relative"
                                style={{ width: panel.width }}
                            >
                                <div className="flex-1 flex flex-col overflow-hidden">
                                    <div className="h-10 bg-slate-900/50 flex items-center justify-between px-4 border-b border-slate-800 shrink-0">
                                        <div className="flex items-center gap-2">
                                            {panel.lang === 'ast' ? <FileJson size={14} className="text-indigo-400" /> : <ArrowRightLeft size={14} className="text-indigo-400" />}
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{panel.lang} View</span>
                                        </div>
                                        <button
                                            onClick={() => removePanel(panel.id)}
                                            className="p-1 text-slate-600 hover:text-red-400 transition-colors"
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                    <div className="flex-1 overflow-hidden bg-slate-950 relative">
                                        {panel.lang === 'ast' ? (
                                            <div className="text-xs font-mono h-full overflow-auto p-4 custom-scrollbar">
                                                {ast ? <JSONTree data={ast} /> : <div className="text-slate-700 text-center mt-10 italic">Valid code required...</div>}
                                            </div>
                                        ) : (
                                            <CodeMirror
                                                value={getTranslation(panel.lang)}
                                                height="100%"
                                                theme={vscodeDark}
                                                extensions={getExtensions(panel.lang)}
                                                readOnly={true}
                                                editable={false}
                                                className="text-[11px] h-full font-mono"
                                            />
                                        )}
                                    </div>
                                </div>
                                {/* Resize Handle for Panel */}
                                <div
                                    className={`absolute top-0 right-0 w-1 h-full cursor-col-resize z-[20] transition-colors ${resizingIdx === idx ? 'bg-indigo-500' : 'bg-transparent hover:bg-indigo-500/30'}`}
                                    onMouseDown={(e) => onMouseDown(e, idx)}
                                />
                            </div>
                        ))}
                    </div>

                    {/* Persistent Add Panel Strip - Outside scroll container to prevent clipping */}
                    <div className="w-16 flex flex-col items-center pt-4 bg-slate-900 border-l border-slate-800 shrink-0 relative z-[150] shadow-[-10px_0_20px_rgba(0,0,0,0.5)]">
                        <div className="relative">
                            <button
                                onClick={() => setShowAddMenu(!showAddMenu)}
                                className="p-3 bg-slate-800 hover:bg-indigo-600 rounded-xl text-indigo-400 hover:text-white transition-all shadow-lg active:scale-90 border border-slate-700"
                                title="Add Translation View"
                            >
                                <Plus size={24} />
                            </button>

                            {showAddMenu && (
                                <div className="absolute top-0 right-full mr-3 w-40 bg-slate-800 border border-slate-700 rounded-lg shadow-[0_10px_40px_rgba(0,0,0,0.7)] overflow-hidden z-[999] animate-in fade-in slide-in-from-right-2 duration-200">
                                    <div className="p-3 text-[11px] font-bold text-slate-400 border-b border-slate-700 bg-slate-900/50 uppercase tracking-widest">
                                        Open View
                                    </div>
                                    <div className="p-1">
                                        {(['python', 'java', 'csp', 'ast'] as SupportedLang[]).map(l => (
                                            <button
                                                key={l}
                                                onClick={() => addPanel(l)}
                                                className="flex items-center gap-3 w-full text-left px-3 py-2.5 text-xs text-slate-300 hover:bg-indigo-600 hover:text-white rounded-md transition-colors capitalize group"
                                            >
                                                {l === 'ast' ? <FileJson size={14} className="opacity-50 group-hover:opacity-100" /> : <Code size={14} className="opacity-50 group-hover:opacity-100" />}
                                                {l === 'csp' ? 'AP CSP' : l}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Bottom Console Panel */}
                <div className="h-44 border-t border-slate-800 flex flex-col bg-slate-900 shrink-0 z-[60]">
                    <div className="h-8 flex items-center px-4 bg-slate-900 border-b border-slate-800">
                        <Terminal size={14} className="mr-2 text-indigo-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Console Output</span>
                        {error && (
                            <div className="ml-4 flex items-center gap-2 text-red-400 text-[10px] font-bold animate-pulse">
                                <AlertCircle size={12} />
                                {error}
                            </div>
                        )}
                    </div>
                    <div className="flex-1 overflow-auto p-4 font-mono text-sm leading-6 bg-slate-950">
                        {output.length === 0 && !error ? (
                            <div className="text-slate-700 italic opacity-40">Run code to see execution results...</div>
                        ) : (
                            output.map((line, idx) => (
                                <div key={idx} className="flex gap-4 border-b border-slate-900/40 last:border-0 py-0.5">
                                    <span className="text-slate-700 select-none w-6 text-right text-xs pt-1">{idx + 1}</span>
                                    <span className="text-slate-300 break-all">{line}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}

function ChevronDown({ size, className }: { size: number, className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="m6 9 6 6 6-6" />
        </svg>
    );
}