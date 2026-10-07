interface Step {
  number: number;
  title: string;
  subtitle: string;
  status: 'completed' | 'active' | 'pending';
}

interface StepsIndicatorProps {
  steps: Step[];
}

export function StepsIndicator({ steps }: StepsIndicatorProps) {
  return (
    <div className="w-full mb-12">
      <div className="hidden md:flex items-center justify-between">
        {steps.map((step, index) => (
          <div key={step.number} className="flex-1">
            <div className="flex items-center gap-4">
              {/* Circle */}
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
                  step.status === 'completed'
                    ? 'bg-orange-600 text-white'
                    : step.status === 'active'
                    ? 'bg-orange-100 text-orange-600 border-2 border-orange-600'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {step.status === 'completed' ? '✓' : step.number}
              </div>

              {/* Text */}
              <div>
                <p className="text-sm font-semibold text-gray-900">{step.title}</p>
                <p className="text-xs text-gray-500">{step.subtitle}</p>
              </div>
            </div>

            {/* Line */}
            {index < steps.length - 1 && (
              <div
                className={`h-1 mt-6 mx-auto ${
                  steps[index].status === 'completed' ? 'bg-orange-600' : 'bg-gray-200'
                }`}
                style={{ marginLeft: '2rem', width: 'calc(100% - 4rem)' }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Mobile Version */}
      <div className="md:hidden">
        <div className="flex items-center justify-between mb-4">
          {steps.map((step, index) => (
            <div key={step.number} className="flex flex-col items-center flex-1">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                  step.status === 'completed'
                    ? 'bg-orange-600 text-white'
                    : step.status === 'active'
                    ? 'bg-orange-100 text-orange-600 border-2 border-orange-600'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {step.status === 'completed' ? '✓' : step.number}
              </div>
              <p className="text-xs font-semibold text-gray-700 mt-2 text-center">{step.title}</p>
            </div>
          ))}
        </div>

        {/* Mobile lines */}
        <div className="flex items-center gap-1 mb-6">
          {steps.map((step, index) => (
            <div
              key={index}
              className={`flex-1 h-1 ${step.status === 'completed' ? 'bg-orange-600' : 'bg-gray-200'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
