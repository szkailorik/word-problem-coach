// 导航令牌:每次路由 +1。异步结果(AI 诊断、出变式、学情报告)回来时先核对令牌,
// 页面已经切走就不再往 #view 里写,免得覆盖孩子正在做的题。
let seq = 0;
export function bumpNav() { return ++seq; }
export function navToken() { return seq; }
export function stillOn(tok) { return tok === seq; }
