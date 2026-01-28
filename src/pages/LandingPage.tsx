import { Link } from 'react-router-dom';
import { Code, ArrowRight, CheckCircle } from 'lucide-react';

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-8 relative overflow-hidden">
            {/* Background Gradients */}
            <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-indigo-900/30 rounded-full blur-[100px]" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-emerald-900/20 rounded-full blur-[100px]" />

            <div className="max-w-3xl text-center space-y-8 relative z-10">
                <div className="inline-flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-full px-4 py-1.5 text-sm text-slate-400 mb-4">
                    <Code size={16} className="text-indigo-400" />
                    <span>Praxly 2.0 is currently in Beta</span>
                </div>

                <h1 className="text-5xl md:text-7xl font-bold tracking-tight text-white">
                    Master Coding with <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
                        Interactive ASTs
                    </span>
                </h1>

                <p className="text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
                    A visual programming environment that bridges the gap between block-based coding and text-based programming. Visualize your logic structure instantly.
                </p>

                <div className="flex items-center justify-center gap-4 pt-4">
                    <Link
                        to="/editor"
                        className="flex items-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-lg transition-all hover:scale-105 shadow-lg shadow-indigo-900/50"
                    >
                        Launch Editor <ArrowRight size={20} />
                    </Link>
                    <a
                        href="https://github.com/victor-hugo-dc/praxly2"
                        target="_blank"
                        rel="noreferrer"
                        className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-medium transition-all"
                    >
                        View on GitHub
                    </a>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left pt-12">
                    {[
                        "Real-time AST Visualization",
                        "Python-compatible Syntax",
                        "Instant Execution Feedback"
                    ].map((feat, i) => (
                        <div key={i} className="flex items-center gap-3 text-slate-300">
                            <CheckCircle size={20} className="text-emerald-500 shrink-0" />
                            <span>{feat}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}