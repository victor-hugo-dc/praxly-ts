import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Play, Trash2, Code, Terminal, FileJson, AlertCircle, Home, Languages } from 'lucide-react';

// CodeMirror Imports
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { vscodeDark } from '@uiw/codemirror-theme-vscode';

import { Lexer } from '../language/lexer';
import { Parser } from '../language/parser';
import { Interpreter } from '../language/interpreter';
import { Translator } from '../language/translator';
import type { Program } from '../language/ast';
import { JSONTree } from '../components/JSONTree';

const SAMPLE_CODE = `x = 10
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

export default function EditorPage() {
    const [code, setCode] = useState(SAMPLE_CODE);
    const [output, setOutput] = useState<string[]>([]);
    const [ast, setAst] = useState<Program | null>(null);
    const [javaCode, setJavaCode] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    const [activeTab, setActiveTab] = useState<'output' | 'ast' | 'translation'>('output');

    const handleRun = () => {
        setError(null);
        setOutput([]);
        try {
            // 1. Lexing
            const lexer = new Lexer(code);
            const tokens = lexer.tokenize();

            // 2. Parsing
            const parser = new Parser(tokens);
            const program = parser.parse();
            setAst(program);

            // 3. Interpreting (Execution)
            const interpreter = new Interpreter();
            const results = interpreter.interpret(program);
            setOutput(results);

            // 4. Translating (Python AST -> Java Code)
            const translator = new Translator();
            const translated = translator.translateToJava(program);
            setJavaCode(translated);

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
        setJavaCode('');
        setError(null);
    };

    // Optimized change handler for CodeMirror
    const onChange = useCallback((val: string) => {
        setCode(val);
    }, []);

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
            {/* Top Navigation Bar */}
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

            {/* Main Workspace */}
            <main className="flex-1 flex overflow-hidden">

                {/* Left Pane: Code Editor */}
                <div className="w-1/2 flex flex-col border-r border-slate-800">
                    <div className="h-10 bg-slate-900 flex items-center px-4 border-b border-slate-800 text-xs font-medium text-slate-400 justify-between select-none">
                        <span className="flex items-center gap-2"><Code size={14} /> src/main.py</span>
                        <span className="text-slate-600">Python 3.10 Compatible</span>
                    </div>
                    <div className="flex-1 relative bg-slate-950 overflow-hidden">
                        {/* CodeMirror Component */}
                        <CodeMirror
                            value={code}
                            height="100%"
                            theme={vscodeDark}
                            extensions={[python()]}
                            onChange={onChange}
                            className="text-sm h-full font-mono"
                        />
                    </div>
                </div>

                {/* Right Pane: Output / AST / Translation */}
                <div className="w-1/2 flex flex-col bg-slate-900">
                    {/* Tabs */}
                    <div className="flex border-b border-slate-800 bg-slate-900">
                        <button
                            onClick={() => setActiveTab('output')}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'output' ? 'border-indigo-500 text-white bg-slate-800/50' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}
                        >
                            <Terminal size={14} /> Output
                        </button>
                        <button
                            onClick={() => setActiveTab('translation')}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'translation' ? 'border-indigo-500 text-white bg-slate-800/50' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}
                        >
                            <Languages size={14} /> Java Translation
                        </button>
                        <button
                            onClick={() => setActiveTab('ast')}
                            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold uppercase tracking-wider border-b-2 transition-colors ${activeTab === 'ast' ? 'border-indigo-500 text-white bg-slate-800/50' : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30'}`}
                        >
                            <FileJson size={14} /> AST
                        </button>
                    </div>

                    <div className="flex-1 overflow-auto bg-slate-950 p-0 relative">
                        {/* Error Banner */}
                        {error && (
                            <div className="absolute top-4 left-4 right-4 z-20 p-3 bg-red-500/10 border border-red-500/50 rounded-md flex items-start gap-3 text-red-200 text-sm backdrop-blur-md">
                                <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-400" />
                                <span className="font-mono">{error}</span>
                            </div>
                        )}

                        {/* Content Switcher */}
                        <div className="h-full">

                            {/* Output Tab */}
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

                            {/* Translation Tab */}
                            {activeTab === 'translation' && (
                                <div className="h-full flex flex-col overflow-hidden">
                                    {javaCode ? (
                                        <CodeMirror
                                            value={javaCode}
                                            height="100%"
                                            theme={vscodeDark}
                                            extensions={[java()]}
                                            readOnly={true}
                                            editable={false}
                                            className="text-sm h-full font-mono"
                                        />
                                    ) : (
                                        <div className="text-slate-600 italic mt-10 text-center p-4">Run code to generate Java translation...</div>
                                    )}
                                </div>
                            )}

                            {/* AST Tab */}
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