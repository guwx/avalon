var update = require('./_update')
var reconcile = require('../strategy/reconcile')
var tryInitComponent = require('../component/init')

avalon.component = function (name, definition) {
    //这是定义组件的分支,并将列队中的同类型对象移除
    if (!avalon.components[name]) {
        avalon.components[name] = definition
    }//这里没有返回值
}
avalon.directive('widget', {
    parse: function (copy, src, binding) {
        src.wid = src.wid || avalon.makeHashCode('w')
        //将渲染函数的某一部分存起来,渲在c方法中转换为函数
        copy[binding.name] = avalon.parseExpr(binding)
        copy.vmodel = '__vmodel__'
        copy.local = '__local__'
    },
    define: function () {
        return avalon.mediatorFactory.apply(this, arguments)
    },
    diff: function (copy, src, name, copyList, srcList, index) {
        var a = copy[name]
        if (Object(a) === a) {
            //有三个地方可以设置is, 属性,标签名,配置对象
            var is = src.props.is || (/^ms\-/.test(src.type) ? src.type : 0)
            if (!is) {//开始大费周章地获取组件的类型
                a = a.$model || a//安全的遍历VBscript
                if (Array.isArray(a)) {//转换成对象
                    a.unshift({})// 防止污染旧数据
                    avalon.mix.apply(0, a)
                    a = a.shift()
                }
                is = a.is
            }
            var vmName = 'component-vm:' + is
            src.props.is = is
            //如果组件没有初始化,那么先初始化(生成对应的vm,$render)
            if (!src[vmName]) {
                if (!tryInitComponent(src, copy[name], copy.vmodel, copy.local)) {
                    //替换成注释节点
                    src.nodeType = 8
                    src.nodeValue = 'unresolved component placeholder'
                    copyList[index] = src
                    update(src, this.mountComment)
                    return
                }
            }
            //如果已经存在于avalon.scopes
            var comVm = src[vmName]
            var render = comVm.$render
            var tree = render(comVm, copy.local)
            var component = tree[0]
            if (component && isComponentReady(component)) {
                src.dynamic = true
                Array(
                        vmName,
                        'component-html:' + is,
                        'component-ready:' + is,
                        'dom', 'dynamic'
                        ).forEach(function (name) {
                    component[name] = src[name]
                })
                if (src.type !== component.type) {
                    copyList[index] = srcList[index] = component
                    update(component, this.mountComponent)
                } else {
                    copyList[index] = component
                    update(component, this.updateComponent)
                }
            } else {
                src.nodeType = 8
                src.nodeValue = 'unresolved component placeholder'
                copyList[index] = src
                update(src, this.mountComment)
            }

        }
    },
    mountComment: function (dom, vdom, parent) {
        var comment = document.createComment(vdom.nodeValue)
        vdom.dom = comment
        parent.replaceChild(comment, dom)
    },
    updateComponent: function (dom, vdom) {
        var vm = vdom["component-vm:" + vdom.props.is]
        var viewChangeObservers = vm.$events.onViewChange
        if (viewChangeObservers && viewChangeObservers.length) {
            update(vdom, viewChangeHandle, 'afterChange')
        }
    },
    mountComponent: function (dom, vdom, parent) {
        var com = avalon.vdomAdaptor(vdom, 'toDOM')
        var is = vdom.props.is
        var vm = vdom['component-vm:' + is]
        vm.$fire('onInit', {
            type: 'init',
            vmodel: vm,
            is: is
        })
        reconcile([com], [vdom])
        parent.replaceChild(com, dom)
        vdom.dom = vm.$element = com
        com.vtree = [vdom]
        avalon.onComponentDispose(com)
        vdom['component-ready:' + is] = true
        //--------------
        avalon.scopes[vm.$id] = {
            vmodel: vm,
            isMount: 2,
            local: vdom.local
        }
        //--------------
        update(vdom, function () {
            vm.$fire('onReady', {
                type: 'ready',
                target: com,
                vmodel: vm,
                is: is
            })
        }, 'afterChange')

        update(vdom, function () {
            vdom[ 'component-html:' + is] = avalon.vdomAdaptor(vdom, 'toHTML')
        }, 'afterChange')
    }
})



function viewChangeHandle(dom, vdom) {
    var is = vdom.props.is
    var vm = vdom[is + '-vm']
    var html = 'component-html:' + is
    var preHTML = vdom[html]
    var curHTML = avalon.vdomAdaptor(vdom, 'toHTML')
    if (preHTML !== curHTML) {
        vdom[html] = curHTML
        vm.$fire('onViewChange', {
            type: 'viewchange',
            target: dom,
            vmodel: vm,
            is: is
        })
    }
}



function isComponentReady(vnode) {
    var isReady = true
    try {
        hasUnresolvedComponent(vnode)
    } catch (e) {
        isReady = false
    }
    return isReady
}

function hasUnresolvedComponent(vnode) {
    vnode.children.forEach(function (el) {
        if (el.nodeType === 8) {
            if (el.nodeValue === 'unresolved component placeholder') {
                throw 'unresolved'
            }
        } else if (el.children) {
            hasUnresolvedComponent(el)
        }
    })
}