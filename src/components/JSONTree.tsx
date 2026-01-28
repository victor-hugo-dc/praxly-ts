export const JSONTree = ({ data, level = 0 }: { data: any, level?: number }) => {
    if (data === null) return <span className="text-slate-500">null</span>;
    if (data === undefined) return <span className="text-slate-500">undefined</span>;

    if (Array.isArray(data)) {
        if (data.length === 0) return <span className="text-slate-500">[]</span>;
        return (
            <div className="ml-2">
                <span className="text-slate-500">{'['}</span>
                {data.map((item, i) => (
                    <div key={i} className="ml-2 border-l border-slate-700 pl-2 my-1">
                        <JSONTree data={item} level={level + 1} />
                    </div>
                ))}
                <span className="text-slate-500">{']'}</span>
            </div>
        );
    }

    if (typeof data === 'object') {
        return (
            <div className="ml-2">
                <span className="text-indigo-400">{'{'}</span>
                {Object.entries(data).map(([key, value]) => {
                    if (key === 'id') return null;
                    return (
                        <div key={key} className="ml-2">
                            <span className="text-cyan-300">{key}</span>: <JSONTree data={value} level={level + 1} />
                        </div>
                    );
                })}
                <span className="text-indigo-400">{'}'}</span>
            </div>
        );
    }

    if (typeof data === 'string') return <span className="text-emerald-400">"{data}"</span>;
    if (typeof data === 'number') return <span className="text-amber-400">{data}</span>;
    if (typeof data === 'boolean') return <span className="text-purple-400">{data.toString()}</span>;

    return <span>{String(data)}</span>;
};