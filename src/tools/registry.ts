export interface ToolDef {
  id: string
  /** Route path (used with HashRouter). */
  path: string
  title: string
  /** Short blurb shown on the home card. */
  short: string
  /** Longer description shown on the tool page. */
  description: string
  /** Emoji icon (placeholder until real icons are added). */
  icon: string
  /** Whether the tool is implemented yet. */
  ready: boolean
}

export const TOOLS: ToolDef[] = [
  {
    id: 'background-removal',
    path: '/background-removal',
    title: '배경 제거 (누끼)',
    short: 'AI로 배경을 자동 제거해 투명 PNG로 만듭니다.',
    description:
      'AI로 배경을 자동 제거하여 투명 PNG로 저장합니다. 모든 처리는 브라우저에서 이루어져 업로드가 없습니다.',
    icon: '🪄',
    ready: true,
  },
  {
    id: 'chroma-key',
    path: '/chroma-key',
    title: '크로마키 제거',
    short: '단색 배경을 가장자리 색 번짐까지 깔끔하게 제거합니다.',
    description:
      '크로마키(단색) 배경을 색상 기준으로 제거합니다. 가장자리 색 번짐 제거(디프린지)와 테두리 다듬기로 깔끔한 외곽선을 만듭니다. 시안·마젠타 등 단색 배경 스프라이트에 적합합니다.',
    icon: '🎬',
    ready: true,
  },
  {
    id: 'crop',
    path: '/crop',
    title: '이미지 자르기',
    short: '원하는 영역을 픽셀 단위로 정확하게 잘라냅니다.',
    description:
      '드래그 또는 수치 입력으로 원하는 영역을 픽셀 단위로 정확하게 잘라냅니다.',
    icon: '✂️',
    ready: true,
  },
  {
    id: 'resize',
    path: '/resize',
    title: '사이즈 조절',
    short: '픽셀/퍼센트로 크기 변경. 픽셀아트 정수 배율 지원.',
    description:
      '픽셀 또는 퍼센트로 이미지 크기를 변경합니다. 픽셀아트를 위한 Nearest-neighbor 보간과 정수 배율(2x·3x·4x)을 지원합니다.',
    icon: '📐',
    ready: true,
  },
  {
    id: 'canvas-resize',
    path: '/canvas-resize',
    title: '캔버스 조절',
    short: '이미지는 그대로 두고 캔버스 여백을 조절합니다.',
    description:
      '이미지 내용은 그대로 유지하고 캔버스 크기를 조절합니다. 9방향 앵커와 투명/색상 여백 채움을 지원합니다.',
    icon: '🖼️',
    ready: true,
  },
  {
    id: 'sprite-sheet',
    path: '/sprite-sheet',
    title: '스프라이트 시트 만들기',
    short: '여러 이미지를 격자로 합쳐 한 장의 시트로 만듭니다.',
    description:
      '여러 프레임 이미지를 균일한 격자로 합쳐 스프라이트 시트를 만듭니다. 열 수·간격·정렬을 지정할 수 있어 애니메이션 캐릭터 시트 제작에 적합합니다.',
    icon: '🎞️',
    ready: true,
  },
  {
    id: 'sheet-editor',
    path: '/sheet-editor',
    title: '스프라이트 시트 편집',
    short: '시트를 격자로 나눠 순서를 바꿔 다시 내보냅니다.',
    description:
      '스프라이트 시트를 불러와 격자로 나눈 뒤, 프레임 순서를 자유롭게 바꾸거나 여러 시트의 프레임을 섞어 새 시트로 내보냅니다. 실시간 미리보기를 제공합니다.',
    icon: '🔀',
    ready: true,
  },
  {
    id: 'compress',
    path: '/compress',
    title: '이미지 압축',
    short: 'PNG·JPG 품질을 조절해 용량을 줄입니다.',
    description:
      '고퀄리티 이미지를 PNG 또는 JPG로 다시 인코딩해 용량을 줄입니다. 포맷별로 품질(JPG)·색상 수(PNG)를 조절하고, 여러 장은 ZIP으로 한 번에 받습니다.',
    icon: '🗜️',
    ready: true,
  },
  {
    id: 'grid-slice',
    path: '/grid-slice',
    title: '그리드 분할',
    short: '스프라이트 시트를 균일 격자로 분할 후 ZIP 저장.',
    description:
      '스프라이트 시트를 균일한 격자로 분할하고 ZIP으로 일괄 저장합니다. 행/열 개수 또는 셀 크기 지정, 빈 셀 건너뛰기를 지원합니다.',
    icon: '🧩',
    ready: true,
  },
]

export const getTool = (id: string): ToolDef | undefined =>
  TOOLS.find((tool) => tool.id === id)
