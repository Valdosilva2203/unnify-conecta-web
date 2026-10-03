export default function LoadingSpinner({ message = "Carregando..." }: { message?: string }) {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="mb-4">
          <div className="inline-block w-12 h-12 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
        </div>
        <p className="text-gray-600 text-sm font-medium">{message}</p>
      </div>
    </div>
  );
}
