import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Play, Trash2, Code, Terminal, FileJson, AlertCircle, Home, Languages, ArrowRightLeft } from 'lucide-react';

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
import { Translator, type TargetLanguage } from '../language/translator';
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

type SupportedLang = 'python' | 'java' | 'csp';

export default function EditorPage() {
    const [code, setCode] = useState(SAMPLE_CODE_PYTHON);
    const [output, setOutput] = useState<string[]>([]);
    const [ast, setAst] = useState<Program | null>(null);

    const [sourceLang, setSourceLang] = useState<SupportedLang>('python');
    const [targetLang, setTargetLang] = useState<SupportedLang>('java');
    const [translatedCode, setTranslatedCode] = useState<string>('');

    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'output' | 'ast' | 'translation'>('output');

    useEffect(() => {
        if (ast) {
            const translator = new Translator();
            try {
                setTranslatedCode(translator.translate(ast, targetLang));
            } catch (e: any) {
                console.warn("Translation failed:", e);
                setTranslatedCode("// Translation failed or not supported.");
            }
        }
    }, [targetLang, ast]);

    const parseCode = (lang: SupportedLang, input: string): Program => {
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
    };

    const handleRun = () => {
        setError(null);
        setOutput([]);
        try {
            // 1. Parse based on Source Language
            const program = parseCode(sourceLang, code);
            setAst(program);

            // 2. Interpret (Execute AST)
            const interpreter = new Interpreter();
            const results = interpreter.interpret(program);
            setOutput(results);

            // 3. Translate to Target Language
            const translator = new Translator();
            setTranslatedCode(translator.translate(program, targetLang));

            setActiveTab('output');
        } catch (e: any) {
            console.error(e);
            setError(e.message);
            setOutput((prev) => [...prev, `Error: ${e.message}`]);
            setActiveTab('output');
        }
    };

    const handleClear = () => {
        setCode('');
        setAst(null);
        setOutput([]);
        setTranslatedCode('');
        setError(null);
    };

    const onChange = useCallback((val: string) => {
        setCode(val);
    }, []);

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

            <main className="flex-1 flex overflow-hidden">
                <div className="w-1/2 flex flex-col border-r border-slate-800">
                    <div className="h-10 bg-slate-900 flex items-center justify-between px-2 border-b border-slate-800 text-xs font-medium text-slate-400 select-none relative z-20">
                        <div className="flex items-center relative group h-full">
                            <button className="flex items-center gap-2 px-3 py-2 hover:bg-slate-800 rounded-md transition-colors text-slate-300">
                                <Code size={14} className="text-indigo-400" />
                                {sourceLang === 'python' ? 'Python' : sourceLang === 'java' ? 'Java' : 'CSP (Pseudo)'}
                                <ChevronDown size={12} className="opacity-50" />
                            </button>
                            <div className="absolute top-full left-0 w-40 bg-slate-800 border border-slate-700 hidden group-hover:block rounded-md shadow-xl overflow-hidden mt-1">
                                <button onClick={() => { setSourceLang('python'); setCode(SAMPLE_CODE_PYTHON); }} className="block w-full text-left px-4 py-2 hover:bg-slate-700 hover:text-white">Python</button>
                                <button onClick={() => { setSourceLang('java'); setCode(SAMPLE_CODE_JAVA); }} className="block w-full text-left px-4 py-2 hover:bg-slate-700 hover:text-white">Java</button>
                                <button onClick={() => { setSourceLang('csp'); setCode(SAMPLE_CODE_CSP); }} className="block w-full text-left px-4 py-2 hover:bg-slate-700 hover:text-white">AP CSP</button>
                            </div>
                        </div>
                        <span className="text-slate-600">Input Source</span>
                    </div>

                    <div className="flex-1 relative bg-slate-950 overflow-hidden">
                        <CodeMirror
                            value={code}
                            height="100%"
                            theme={vscodeDark}
                            extensions={getExtensions(sourceLang)}
                            onChange={onChange}
                            className="text-sm h-full font-mono"
                        />
                    </div>
                </div>

                <div className="w-1/2 flex flex-col bg-slate-900">
                    <div className="flex border-b border-slate-800 bg-slate-900">
                        <button
                            onClick={() => setActiveTab('output')}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'output' ? 'border-indigo-500 text-white bg-slate-800/50' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}
                        >
                            <Terminal size={14} /> Output
                        </button>
                        <div className={`flex-1 flex items-center justify-center border-b-2 transition-colors relative group ${activeTab === 'translation' ? 'border-indigo-500 text-white bg-slate-800/50' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}>
                            <button
                                onClick={() => setActiveTab('translation')}
                                className="flex items-center gap-2 py-3 text-xs font-semibold uppercase tracking-wider w-full justify-center h-full"
                            >
                                <ArrowRightLeft size={14} />
                                To: {targetLang === 'java' ? 'Java' : targetLang === 'python' ? 'Python' : 'CSP'}
                            </button>
                            <div className="absolute top-full left-0 w-full bg-slate-800 border border-slate-700 hidden group-hover:block z-50 rounded-b-md shadow-xl">
                                <button onClick={() => { setTargetLang('java'); setActiveTab('translation'); }} className="block w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-700 hover:text-white">Java</button>
                                <button onClick={() => { setTargetLang('python'); setActiveTab('translation'); }} className="block w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-700 hover:text-white">Python</button>
                                <button onClick={() => { setTargetLang('csp'); setActiveTab('translation'); }} className="block w-full text-left px-4 py-2 text-xs text-slate-300 hover:bg-slate-700 hover:text-white">AP CSP</button>
                            </div>
                        </div>
                        <button
                            onClick={() => setActiveTab('ast')}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'ast' ? 'border-indigo-500 text-white bg-slate-800/50' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}
                        >
                            <FileJson size={14} /> AST
                        </button>
                    </div>

                    <div className="flex-1 overflow-auto bg-slate-950 p-0 relative">
                        {error && (
                            <div className="absolute top-4 left-4 right-4 z-20 p-3 bg-red-500/10 border border-red-500/50 rounded-md flex items-start gap-3 text-red-200 text-sm backdrop-blur-md">
                                <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-400" />
                                <span className="font-mono">{error}</span>
                            </div>
                        )}
                        <div className="h-full">
                            {activeTab === 'output' && (
                                <div className="font-mono text-sm space-y-1 h-full p-4">
                                    {output.length === 0 && !error && <div className="text-slate-600 italic mt-10 text-center">Run the code to see output...</div>}
                                    {output.map((line, idx) => (
                                        <div key={idx} className="flex gap-3 group">
                                            <span className="text-slate-700 select-none group-hover:text-slate-500 transition-colors">$</span>
                                            <span className="text-slate-300">{line}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {activeTab === 'translation' && (
                                <div className="h-full flex flex-col overflow-hidden">
                                    {translatedCode ? (
                                        <CodeMirror
                                            value={translatedCode}
                                            height="100%"
                                            theme={vscodeDark}
                                            extensions={getExtensions(targetLang)}
                                            readOnly={true}
                                            editable={false}
                                            className="text-sm h-full font-mono"
                                        />
                                    ) : (
                                        <div className="text-slate-600 italic mt-10 text-center p-4">Run code to generate translation...</div>
                                    )}
                                </div>
                            )}
                            {activeTab === 'ast' && (
                                <div className="text-xs font-mono h-full overflow-auto pb-10 p-4">
                                    {ast ? <JSONTree data={ast} /> : <div className="text-slate-600 italic mt-10 text-center">Run code to visualize AST...</div>}
                                </div>
                            )}
                        </div>
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