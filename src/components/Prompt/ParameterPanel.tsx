import { Settings2, RotateCcw } from 'lucide-react';
import { PromptConfig, DEFAULT_PROMPT_CONFIG } from '../../types/database';
import { Slider, Collapsible, Button } from '../ui';

interface ParameterPanelProps {
  config: PromptConfig;
  onChange: (config: PromptConfig) => void;
  disabled?: boolean;
  defaultOpen?: boolean;
}

export function ParameterPanel({ config, onChange, disabled = false, defaultOpen = false }: ParameterPanelProps) {
  const handleChange = (key: keyof PromptConfig, value: number) => {
    onChange({ ...config, [key]: value });
  };

  const handleReset = () => {
    onChange(DEFAULT_PROMPT_CONFIG);
  };

  const isModified = JSON.stringify(config) !== JSON.stringify(DEFAULT_PROMPT_CONFIG);

  return (
    <Collapsible
      title="模型参数"
      icon={<Settings2 className="w-4 h-4 text-cyan-400 light:text-cyan-600" />}
      defaultOpen={defaultOpen}
      action={
        isModified && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-xs"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            重置
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <Slider
          label="温度 (Temperature)"
          value={config.temperature}
          min={0}
          max={2}
          step={0.1}
          onChange={(value) => handleChange('temperature', value)}
          tooltip="控制随机性，值越高输出越随机"
          disabled={disabled}
        />

        <Slider
          label="Top P"
          value={config.top_p}
          min={0}
          max={1}
          step={0.1}
          onChange={(value) => handleChange('top_p', value)}
          tooltip="核采样，值越低输出越聚焦"
          disabled={disabled}
        />

        <Slider
          label="频率惩罚"
          value={config.frequency_penalty}
          min={0}
          max={2}
          step={0.1}
          onChange={(value) => handleChange('frequency_penalty', value)}
          tooltip="减少重复词汇的出现"
          disabled={disabled}
        />

        <Slider
          label="存在惩罚"
          value={config.presence_penalty}
          min={0}
          max={2}
          step={0.1}
          onChange={(value) => handleChange('presence_penalty', value)}
          tooltip="鼓励引入新话题"
          disabled={disabled}
        />

        <Slider
          label="最大 Tokens"
          value={config.max_tokens}
          min={1}
          max={32000}
          step={1}
          onChange={(value) => handleChange('max_tokens', value)}
          tooltip="生成的最大 token 数量"
          disabled={disabled}
        />
      </div>
    </Collapsible>
  );
}
