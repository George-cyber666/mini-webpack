const fs = require('fs')
const path = require('path')
// babylon解析js语法，生成AST语法树
// AST将js代码转化为一种JSON数据结构
const babylon = require('babylon')
// babel-traverse 是一个对ast进行遍历的工具，对ast进行替换
const traverse = require('babel-traverse').default
// 将es6 es7 等高级语法转化为es5语法
const { transformFromAst } = require('babel-core')

let ID = 0

function createAsset (filename) {
  const content = fs.readFileSync(filename, 'utf-8')
  // 获取该文件对应的ast抽象语法树
  const ast = babylon.parse(content, {
    sourceType: 'module'
  })

  // dependencies保存所依赖的模块的相对路径
  const dependencies = []
  // 通过查找import节点，找到该文件的依赖关系
  // 因为项目中我们都是通过import 引入文件的，所以找到import节点，就找到了引用了哪些文件
  traverse(ast, {
    ImportDeclaration: ({ node }) => {
      // 查找import节点
      dependencies.push(node.source.value)
    }
  })
  // 通过递增计数器，为此模块分配唯一标识符, 用于缓存已解析过的文件
  const id = ID++
  // 该presets选项是一组规则，告诉babel如何传输我们的代码，
  // 用babel-preset-env将代码转换为浏览器可以执行的东西
  const { code } = transformFromAst(ast, null, {
    presets: ['env']
  })

  // 返回此模块的相关信息
  return {
    id, // 文件唯一id
    filename, // 文件路径
    dependencies, // 文件的依赖关系
    code // 文件代码
  }
}

// 我们将提取它的每一个依赖文件的依赖关系，递归下去，找到对应的这个项目的‘依赖图’
function createGraph (entry) {
  // 得到入口文件的依赖关系
  const mainAsset = createAsset(entry)
  const queue = [mainAsset]
  for (const asset of queue) {
    asset.mapping = {}
    // 获取这个模块所在的目录
    const dirname = path.dirname(asset.filename)
    asset.dependencies.forEach((relativePath) => {
      // 通过将相对路径与父资源目录的路径连接，将相对路径转变为绝对路径
      // 每个文件的绝对路径是固定的、唯一的
      const absolutePath = path.join(dirname, relativePath)
      // 递归解析其中所引入的其他资源
      const child = createAsset(absolutePath)
      asset.mapping[relativePath] = child.id
      // 将child推入队列，通过递归实现了这样它的依赖关系解析
      queue.push(child)
    })
  }
  return queue
}

// 自定义实现了require方法，找到导出变量的引用逻辑
function bundle (graph) {
  let modules = ''
  graph.forEach(mod => {
      modules += `${mod.id}: [
        function (require, module, exports) { ${ mod.code } },
        ${JSON.stringify(mod.mapping)},
      ],`
  })
  const result = `
    (function(modules) {
      function require(id) {
        const [fn, mapping] = modules[id]
        function localRequire(name) {
          return require(mapping[name])
        }
        const module = { exports: {}}
        fn(localRequire, module, module.exports)
        return module.exports
      }
      require(0)
    })({${modules}})
  `
  return result
}

// 项目的入口文件
const graph = createGraph('./example/entry.js')
console.log('%c 🍊 graph: ', 'font-size:20px;background-color: #7F2B82;color:#fff;', graph);
const result = bundle(graph)

// 创建dist目录，将打包的内容写入main.js
fs.mkdir('dist', err => {
  if (!err) {
    fs.writeFile('dist/main.js', result, err1 => {
      if (!err1) console.log('打包成功')
    })
  }
})