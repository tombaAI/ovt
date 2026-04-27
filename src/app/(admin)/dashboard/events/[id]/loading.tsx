export default function Loading() {
    return (
        <div className="max-w-2xl mx-auto animate-pulse space-y-4 pt-2">
            <div className="h-5 w-32 bg-gray-100 rounded" />
            <div className="h-7 w-64 bg-gray-100 rounded" />
            <div className="h-px bg-gray-100" />
            <div className="rounded-xl border px-4 py-2 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex gap-4 py-2 border-b last:border-0">
                        <div className="h-4 w-24 bg-gray-100 rounded shrink-0" />
                        <div className="h-4 flex-1 bg-gray-100 rounded" />
                    </div>
                ))}
            </div>
        </div>
    );
}
