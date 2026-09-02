/**
 * 部署专属工具 —— 部署槽。
 *
 * main 上这里是空的。各部署分支（car-v2 等）整个替换掉这个文件，于是分支和
 * main 的代码差异就只有这一个文件，`git merge main` 永远不会在这里冲突——
 * git 只会看到 main 从没动过它。
 *
 * 【别在 main 上往这里加工具】一旦 main 改了这个文件，上面那个性质就没了，
 * 每个部署分支的每次合并都会在这里冲突。
 *
 *   所有部署都要的     → ./builtin.js
 *   运行时增删改的     → Tools 服务（见 ../tools-api.js）
 *   只有某个部署要的   → 这里，但在那个部署的分支上改
 *
 * 工具的形状是 { definition, createHandler }，见 ./index.js 顶部说明。
 */

export const deploymentTools = [];
