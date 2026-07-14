export interface ToolCategory {
  id: string
  label: string
  description: string
}

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
  category: string
}

export const PRIMARY_TOOLS: ToolDef[] = [
  {
    id: 'image-editor',
    path: '/image-editor',
    title: '이미지 에디터',
    short: '도형, 브러쉬, 지우개, 레이어, 색상, 투명도, 내보내기를 한 화면에서 편집합니다.',
    description:
      '벡터 도형과 래스터 브러쉬를 함께 다루는 통합 이미지 편집기입니다. 도형은 다시 선택해 수정할 수 있고, PNG와 JSON 프로젝트 저장을 지원합니다.',
    icon: 'Edit',
    ready: true,
    category: 'primary',
  },
]

export const CATEGORIES: ToolCategory[] = [
  { id: 'background', label: '배경 처리', description: '배경 제거 · 크로마키' },
  { id: 'editing', label: '기본 편집', description: '자르기 · 크기 조절 · 픽셀화 · 압축' },
  { id: 'color', label: '색상 도구', description: '색 보정 · 팔레트 교체 · 색상 치환' },
  { id: 'sprite', label: '스프라이트 / 게임', description: '시트 제작 · 편집 · 분할' },
]

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
    category: 'background',
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
    category: 'background',
  },
  {
    id: 'crop',
    path: '/crop',
    title: '이미지 자르기',
    short: '크기와 위치를 픽셀 단위로 조정해 원하는 영역을 잘라냅니다.',
    description:
      'W/H로 크기를 정하고 위치 이동과 테두리 조정으로 원하는 영역을 픽셀 단위로 정확하게 잘라냅니다.',
    icon: '✂️',
    ready: true,
    category: 'editing',
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
    category: 'editing',
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
    category: 'editing',
  },
  {
    id: 'pixelate',
    path: '/pixelate',
    title: '이미지 픽셀화',
    short: '강도를 조절해 이미지를 픽셀아트처럼 변환합니다.',
    description:
      '픽셀 블록 크기를 조절해 이미지를 픽셀아트 스타일로 변환합니다. PNG 투명도(알파)를 유지한 채 결과를 PNG로 저장합니다.',
    icon: '🟪',
    ready: true,
    category: 'editing',
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
    category: 'editing',
  },
  {
    id: 'color-adjust',
    path: '/color-adjust',
    title: '색상 조절',
    short: '밝기·대비·채도·색조 등 포토샵식 색 보정.',
    description:
      '밝기·대비·채도·색조·색온도·감마와 포스터화·반전·흑백·세피아까지, 포토샵식 색 보정을 실시간 미리보기로 적용합니다.',
    icon: '🎨',
    ready: true,
    category: 'color',
  },
  {
    id: 'palette',
    path: '/palette',
    title: '팔레트 교체',
    short: '팔레트를 추출해 다른 팔레트로 다시 칠합니다.',
    description:
      '이미지에서 색 팔레트를 추출하고, 레퍼런스 이미지의 팔레트나 직접 편집한 팔레트로 다시 칠합니다. 각 픽셀을 가장 가까운 팔레트 색으로 매핑해 픽셀아트 느낌의 색감 변환을 만듭니다.',
    icon: '🌈',
    ready: true,
    category: 'color',
  },
  {
    id: 'replace-color',
    path: '/replace-color',
    title: '색상 치환',
    short: '선택한 색 계열만 명암을 유지한 채 다른 색으로 바꿉니다.',
    description:
      '포토샵의 색상 대체처럼, 이미지를 클릭해 바꿀 색을 고르고 허용치로 범위를 조절한 뒤 색조·채도·명도를 이동합니다. 명암과 부드러운 경계를 유지한 채 색만 바뀌며, 여러 장을 같은 설정으로 한 번에 처리할 수 있습니다.',
    icon: '💧',
    ready: true,
    category: 'color',
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
    category: 'sprite',
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
    category: 'sprite',
  },
  {
    id: 'gif-split',
    path: '/gif-split',
    title: 'GIF 분할 / 변환',
    short: 'GIF를 프레임으로 분해해 스프라이트 시트나 개별 PNG로 만듭니다.',
    description:
      'GIF 애니메이션의 모든 프레임을 추출해 한 장의 스프라이트 시트(PNG) 또는 개별 PNG(ZIP)로 변환합니다. 프레임 합성·투명도를 그대로 유지하며, 모든 처리는 브라우저에서 업로드 없이 이루어집니다.',
    icon: '📽️',
    ready: true,
    category: 'sprite',
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
    category: 'sprite',
  },
]

export const ALL_TOOLS: ToolDef[] = [...PRIMARY_TOOLS, ...TOOLS]

export const getTool = (id: string): ToolDef | undefined =>
  ALL_TOOLS.find((tool) => tool.id === id)
