import React, { useState, useMemo } from 'react';
import { useStore } from '../../state/store';

type Filter = 'all' | 'important';

export const MessageLog: React.FC = () => {
  const { messages, clearMessages } = useStore();
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    const list = filter === 'important'
      ? messages.filter(m => m.important)
      : messages;
    return list.slice(-20).reverse();
  }, [messages, filter]);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 border-t border-gray-700 p-2 max-h-40 overflow-y-auto text-xs">
      <div className="flex items-center justify-between mb-1">
        <div className="flex gap-1">
          <button
            onClick={() => setFilter('all')}
            className={`px-2 py-1 rounded ${filter === 'all' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            全部
          </button>
          <button
            onClick={() => setFilter('important')}
            className={`px-2 py-1 rounded ${filter === 'important' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            重要
          </button>
        </div>
        <button
          onClick={clearMessages}
          className="text-gray-500 hover:text-gray-300"
        >
          清空
        </button>
      </div>
      <div className="space-y-0.5">
        {filtered.length === 0 ? (
          <p className="text-gray-600">暂无消息</p>
        ) : (
          filtered.map(msg => (
            <div
              key={msg.id}
              className={`${
                msg.important
                  ? 'bg-yellow-900/50 text-yellow-300'
                  : 'text-gray-300'
              } px-2 py-0.5 rounded`}
            >
              {msg.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
