// E3 城邦时代 · 贸易邻邦数据（固定 5 个，用户拍板不随机）
//
// 设计意图（贴合苏美尔主线）：
// · 两河流域缺石缺木 → 有石头/木材进口路线
// · 锡几乎只产自远方 → 距离 1 的近邻迪尔蒙是**唯一**锡源
// · 青金石商路是"远方奢华"——距离 3，需「青金石商路」科技解锁

export interface NeighborDef {
  id: string;
  name: string;
  icon: string;
  distance: 1 | 2 | 3;
  /** 我方支付的货物 */
  accept: string;
  /** 我方换得的货物 */
  sell: string;
  /** 一句话描述（中文） */
  desc: string;
}

export const NEIGHBORS: NeighborDef[] = [
  {
    id: 'dilmun',
    name: '迪尔蒙',
    icon: '🏝️',
    distance: 1,
    accept: 'food',
    sell: 'tin',
    desc: '波斯湾的中转站，距此最近。用食物换锡——锡的唯一进口来源。',
  },
  {
    id: 'uruk',
    name: '南方城邦',
    icon: '🏛️',
    distance: 1,
    accept: 'food',
    sell: 'stone',
    desc: '两河南部的兄弟城邦。用大麦换石头——本地冲积平原缺石。',
  },
  {
    id: 'elam',
    name: '埃兰',
    icon: '⛰️',
    distance: 2,
    accept: 'wood',
    sell: 'copper',
    desc: '东部山地的埃兰人。用木材换红铜——铜的第二来源。',
  },
  {
    id: 'magan',
    name: '玛甘',
    icon: '⛵',
    distance: 3,
    accept: 'fabric',
    sell: 'copper',
    desc: '隔海相望的阿曼铜产地。用织物换铜——路途最远，代价高。',
  },
  {
    id: 'meluhha',
    name: '美鲁哈',
    icon: '🧿',
    distance: 3,
    accept: 'wood',
    sell: 'lapis',
    desc: '印度河流域的远方国度。用木材换青金石——需「青金石商路」科技解锁。',
  },
];

export const NEIGHBOR_MAP: Record<string, NeighborDef> = Object.fromEntries(
  NEIGHBORS.map(n => [n.id, n])
);
