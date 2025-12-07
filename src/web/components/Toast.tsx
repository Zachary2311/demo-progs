import { useToastStore } from '../store';
import { XMarkIcon, CheckCircleIcon, ExclamationCircleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';

export default function Toast() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast-enter flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg max-w-sm ${
            toast.type === 'success'
              ? 'bg-green-600'
              : toast.type === 'error'
              ? 'bg-red-600'
              : 'bg-blue-600'
          }`}
        >
          {toast.type === 'success' && <CheckCircleIcon className="w-5 h-5 flex-shrink-0" />}
          {toast.type === 'error' && <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0" />}
          {toast.type === 'info' && <InformationCircleIcon className="w-5 h-5 flex-shrink-0" />}
          
          <p className="text-sm flex-1">{toast.message}</p>
          
          <button
            onClick={() => removeToast(toast.id)}
            className="p-1 hover:bg-white/20 rounded"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
