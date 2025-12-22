import { Compass, FileText, Wand2, ArrowRight, Sparkles } from 'lucide-react';
import { Button } from '../components/ui';

interface HomePageProps {
  onNavigate: (page: string) => void;
}

export function HomePage({ onNavigate }: HomePageProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 bg-gradient-to-b from-slate-950 to-slate-900 light:from-slate-50 light:to-white">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center mb-6 shadow-lg shadow-cyan-500/20">
          <Compass className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-4xl font-bold text-white light:text-slate-900 mb-3">
          SSRPrompt
        </h1>
        <p className="text-lg text-slate-400 light:text-slate-600 max-w-md mx-auto">
          专业的 Prompt 工程平台，帮助您构建、测试和优化 AI 提示词
        </p>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
        {/* Create New Prompt */}
        <button
          onClick={() => onNavigate('wizard')}
          className="group p-8 rounded-2xl border-2 border-slate-700 light:border-slate-200 hover:border-cyan-500 light:hover:border-cyan-400 bg-slate-900/50 light:bg-white transition-all text-left hover:shadow-lg hover:shadow-cyan-500/10"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500 to-teal-500 text-white group-hover:scale-110 transition-transform">
              <Wand2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white light:text-slate-900">
                从0开始写 Prompt
              </h2>
              <p className="text-sm text-cyan-400 light:text-cyan-600">AI 引导创建</p>
            </div>
          </div>
          <p className="text-slate-400 light:text-slate-600 mb-4">
            不知道如何开始？让 AI 帮助您一步步构建专业的 Prompt，支持场景模板选择。
          </p>
          <div className="flex items-center text-cyan-400 light:text-cyan-600 font-medium">
            <Sparkles className="w-4 h-4 mr-2" />
            <span>开始创建</span>
            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>

        {/* Debug Existing Prompt */}
        <button
          onClick={() => onNavigate('prompts')}
          className="group p-8 rounded-2xl border-2 border-slate-700 light:border-slate-200 hover:border-teal-500 light:hover:border-teal-400 bg-slate-900/50 light:bg-white transition-all text-left hover:shadow-lg hover:shadow-teal-500/10"
        >
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-500 text-white group-hover:scale-110 transition-transform">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white light:text-slate-900">
                调试现有 Prompt
              </h2>
              <p className="text-sm text-teal-400 light:text-teal-600">直接进入工作区</p>
            </div>
          </div>
          <p className="text-slate-400 light:text-slate-600 mb-4">
            已有 Prompt？直接进入开发工作区，进行测试、对比和优化。
          </p>
          <div className="flex items-center text-teal-400 light:text-teal-600 font-medium">
            <FileText className="w-4 h-4 mr-2" />
            <span>进入工作区</span>
            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </div>
        </button>
      </div>

      {/* Quick Stats or Tips */}
      <div className="mt-12 text-center">
        <p className="text-sm text-slate-500 light:text-slate-400">
          提示：您可以随时从侧边栏导航到不同功能区域
        </p>
      </div>
    </div>
  );
}
