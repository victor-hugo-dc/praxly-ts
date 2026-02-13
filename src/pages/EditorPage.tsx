import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, Trash2, Code, Terminal, FileJson, AlertCircle, Home, ArrowRightLeft } from 'lucide-react';

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

export default function EditorPage() {
    const [code, setCode] = useState(SAMPLE_CODE_PYTHON);
    const [output, setOutput] = useState<string[]>([]);
    const [ast, setAst] = useState<Program | null>(null);
    const [sourceLang, setSourceLang] = useState<SupportedLang>('python');
    const [error, setError] = useState<string | null>(null);

    const [activeTargetTab, setActiveTargetTab] = useState<SupportedLang>('java');
    const languages: SupportedLang[] = ['python', 'java', 'csp', 'ast'];

    // --- Logic ---
    const parseCode = useCallback((lang: SupportedLang, input: string): Program | null => {
        if (lang === 'ast') return null; // AST can't be parsed as a source directly in this logic

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

    // Update AST whenever code or source language changes
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

    const handleRun = async () => {
        setError(null);
        setOutput([]);
        try {
            const program = parseCode(sourceLang === 'ast' ? 'python' : sourceLang, code);
            if (!program) return;
            setAst(program);

            const interpreter = new Interpreter();
            const results = await interpreter.interpret(program);
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
        if (!ast) return "// Run or type code to see translation...";
        if (target === 'ast') return JSON.stringify(ast, null, 2);

        const translator = new Translator();
        try {
            // Using a generic translation method based on target language
            return (translator as any).translate(ast, target);
        } catch (e) {
            return `// Translation to ${target} not supported yet or failed.`;
        }
    };

    const getExtensions = (lang: SupportedLang) => {
        switch (lang) {
            case 'java': return [java()];
            case 'python': return [python()];
            default: return [];
        }
    };

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
            <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 shadow-sm z-10">
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
                <div className="flex-1 flex overflow-hidden min-h-0">
                    <div className="w-1/2 flex flex-col border-r border-slate-800">
                        <div className="h-10 bg-slate-900 flex items-center justify-between px-2 border-b border-slate-800 text-xs font-medium text-slate-400 select-none relative z-20">
                            <div className="flex items-center relative group h-full">
                                <button className="flex items-center gap-2 px-3 py-2 hover:bg-slate-800 rounded-md transition-colors text-slate-300">
                                    <Code size={14} className="text-indigo-400" />
                                    <span className="capitalize">{sourceLang === 'csp' ? 'AP CSP' : sourceLang}</span>
                                    <ChevronDown size={12} className="opacity-50" />
                                </button>
                                <div className="absolute top-full left-0 w-40 bg-slate-800 border border-slate-700 hidden group-hover:block rounded-md shadow-xl overflow-hidden mt-1 z-50">
                                    <button onClick={() => { setSourceLang('python'); setCode(SAMPLE_CODE_PYTHON); }} className="block w-full text-left px-4 py-2 hover:bg-slate-700 hover:text-white">Python</button>
                                    <button onClick={() => { setSourceLang('java'); setCode(SAMPLE_CODE_JAVA); }} className="block w-full text-left px-4 py-2 hover:bg-slate-700 hover:text-white">Java</button>
                                    <button onClick={() => { setSourceLang('csp'); setCode(SAMPLE_CODE_CSP); }} className="block w-full text-left px-4 py-2 hover:bg-slate-700 hover:text-white">AP CSP</button>
                                    <button onClick={() => { setSourceLang('ast'); }} className="block w-full text-left px-4 py-2 hover:bg-slate-700 hover:text-white">AST View</button>
                                </div>
                            </div>
                            <span className="text-slate-600">Source Editor</span>
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

                    <div className="w-1/2 flex flex-col bg-slate-900">
                        <div className="flex border-b border-slate-800 bg-slate-900 overflow-x-auto no-scrollbar">
                            {languages.map(lang => (
                                <button
                                    key={lang}
                                    onClick={() => setActiveTargetTab(lang)}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-all min-w-[100px] ${activeTargetTab === lang
                                            ? 'border-indigo-500 text-white bg-slate-800/50'
                                            : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'
                                        }`}
                                >
                                    {lang === 'ast' ? <FileJson size={14} /> : <ArrowRightLeft size={14} />}
                                    {lang}
                                </button>
                            ))}
                        </div>

                        <div className="flex-1 overflow-hidden bg-slate-950 p-0 relative">
                            {error && (
                                <div className="absolute top-4 left-4 right-4 z-20 p-3 bg-red-500/10 border border-red-500/50 rounded-md flex items-start gap-3 text-red-200 text-sm backdrop-blur-md">
                                    <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-400" />
                                    <span className="font-mono">{error}</span>
                                </div>
                            )}
                            <div className="h-full">
                                {activeTargetTab === 'ast' ? (
                                    <div className="text-xs font-mono h-full overflow-auto p-4">
                                        {ast ? <JSONTree data={ast} /> : <div className="text-slate-600 italic mt-10 text-center">Parse code to visualize AST...</div>}
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col overflow-hidden">
                                        <CodeMirror
                                            value={getTranslation(activeTargetTab)}
                                            height="100%"
                                            theme={vscodeDark}
                                            extensions={getExtensions(activeTargetTab)}
                                            readOnly={true}
                                            editable={false}
                                            className="text-sm h-full font-mono"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="h-48 border-t border-slate-800 flex flex-col bg-slate-900 shrink-0">
                    <div className="h-8 flex items-center px-4 bg-slate-900/50 border-b border-slate-800">
                        <Terminal size={14} className="mr-2 text-indigo-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Console Output</span>
                    </div>
                    <div className="flex-1 overflow-auto p-4 font-mono text-sm leading-6 bg-slate-950">
                        {output.length === 0 && !error ? (
                            <div className="text-slate-600 italic opacity-50">Program output will appear here after clicking "Run Code"...</div>
                        ) : (
                            output.map((line, idx) => (
                                <div key={idx} className="flex gap-4 border-b border-slate-900/50 last:border-0 py-0.5">
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