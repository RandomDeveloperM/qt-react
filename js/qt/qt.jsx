var React = require('react');
var ReactDOM = require('react-dom');
var cloneWithProps = require('react-addons-clone-with-props');
var EventEmitter = require('events').EventEmitter;
var lodash = require('lodash');
var ResizableBox = require('react-resizable').ResizableBox;
var Draggable = require('react-draggable');

var Signals = new EventEmitter();


const Qt = {
    LeftDockWidgetArea: 1,
    RightDockWidgetArea: 2,
    TopDockWidgetArea: 4,
    BottomDockWidgetArea: 8,

    ToolButtonIconOnly:	0,
    ToolButtonTextOnly: 1,
    ToolButtonTextBesideIcon: 2,
    ToolButtonTextUnderIcon: 3,
    ToolButtonFollowStyle: 4
};

var QAbstractItemModel = function(){
    this.data = function(row, column, parent){

    }
};

var QModelIndex = function(data){
    this.row = data.row;
    this.column = data.column;
    this.parent = data.parent;
    this.model = data.model;
    this._internalData = data.internal;
    this.internalPointer = function(){
        return this._internalData;
    };
    this.hasChildren = function(){
        return this.model.rowCount(this) > 0;
    };
};

var _JSArrayModel = function(jsObject, mappings){
    this._data = jsObject;
    this._mappings = mappings;

    this.index = function(row, column, parent){
        if (parent){
            var parent_data = parent.internalPointer()['children'];
        } else {
            var parent_data = this._data;
        }
        var data = parent_data[row];
        if (!data) {
            console.log(parent, parent_data);
            throw "missing data " + row;
        }
        return new QModelIndex({row: row, column: column, parent: parent, model: this, internal: data});
    };
    this.parent = function(child){
        return child.parent;
    };
    this.columnCount = function(index){
        return this._mappings.length;
    };
    this.rowCount = function(index){
        if (!index) return this._data.length;
        var children = index.internalPointer()['children'];
        if (!children) return 0;
        return children.length;
    };
    this.itemData = function(index){
        var data = index.internalPointer();
        var column = this._mappings[index.column];

        return {
            DisplayRole: data[column.name]['DisplayRole'],
            DecorationRole: data[column.name]['DecorationRole']
        };
    };
};

var JSArrayModel = function(array, columns){
    return new _JSArrayModel(array, columns);
};

var _QStringListModel = function(string_list){
    this._string_list = string_list;
    this.data = function(index, role){
        return this._string_list[index.row];
    };
    this.index = function(row, column, parent){
        return {row: row, column: column, parent: parent};
    };
    this.rowCount = function(parent){
        return this._string_list.length;

    };
};

var QStringListModel = function(string_list){
    return new _QStringListModel(string_list);
};

var _QItemSelectionModel = function(model){
    this.model = model;
    this._currentIndex = null;
    this._emitter = new EventEmitter();

    this.currentIndex = function(){
        return this._currentIndex;
    };
    this.setCurrentIndex = function(index){
        this._currentIndex = index;
        this._emitter.emit('currentChanged');
    }
};
var QItemSelectionModel = function(model){
    return new _QItemSelectionModel(model);
};

var range = function(n){
    return Array.apply(null, Array(n)).map(function(_, i){return i;})
};

var pathToIndex = function(startIndex, endIndex){
    var result = [];
    var current = endIndex;
    for (var i=0; i<10; i++){
        if (!current || current.hasChildren())
            result.push(current);
        if (!current) break;
        current = current.parent;
    }
    result.reverse();
    return result;
};

var QDockWidget = React.createClass({
    render: function(){
        return (<div>{this.props.children}</div>)
    }
});

var ResizeHandle = React.createClass({
    startDrag: function(){
    },
    updateDrag: function(evt, state){
        this.props.onResize(evt, state.position, state.node);
    },
    stopDrag: function(){
    },

    render: function(){
        var cls = this.props.axis == 'x' ? 'handle x' : 'handle y';
        return <Draggable
            ref="draggable"
            onStop={this.stopDrag}
            onStart={this.startDrag}
            onDrag={this.updateDrag}
            axis={this.props.axis}
            >
            <div className={cls} style={{transform: 'none'}}></div>
        </Draggable>
    }
});

var QColumnView = React.createClass({

    componentDidMount: function() {
        this.props.selectionModel._emitter.on('currentChanged', this.refresh);
    },

    componentWillUnmount: function() {
        this.props.selectionModel._emitter.removeListener(this.refresh);
    },

    refresh: function(){
        this.setState({});
    },

    render: function(){
        var max_depth = 10;

        var path = pathToIndex(this.props.rootIndex, this.props.selectionModel.currentIndex());
        var list_views = path.map(function(index, i){
            return (<QListView key={i} selectionModel={this.props.selectionModel} model={this.props.model} rootIndex={index} >
                </QListView>
            )
        }, this);

        return (<div className="QColumnView">{list_views}</div>)
    }
});

var QTreeView = React.createClass({

    getIndexList: function(index, stack){
        var items = range(this.props.model.rowCount(index)).map(function(i){
            var child_index = this.props.model.index(i, 0, index);
            stack.push(child_index);
            this.getIndexList(child_index, stack);
        }, this);
    },

    render: function(){
        var index_list = [];
        this.getIndexList(this.props.rootIndex, index_list);
        var items = index_list.map(function(index, i){
            var cells = range(this.props.model.columnCount()).map(function(c, i){
                var column_index = this.props.model.index(index.row, c, index.parent);
                var cell_data = this.props.model.itemData(column_index);
                return (<span style={{width: 100, display: 'inline-block'}} key={i}>{cell_data.DisplayRole}</span>)
            }, this);

            return (<div key={i}>{cells}</div>)
        }, this);
        return (<div className="QTreeView">{items}</div>)
    }
});

var QListView = React.createClass({

    itemClicked: function(index){
        this.props.selectionModel.setCurrentIndex(index);
        this.setState({});
    },

    render: function(){

        var model = this.props.model;
        if (!model) return (<div></div>);
        var row_count = this.props.model.rowCount(this.props.rootIndex);
        var items = range(row_count).map(function(i){
            var index = model.index(i, 0, this.props.rootIndex);
            var data = model.itemData(index);
            var current = this.props.selectionModel.currentIndex();
            var isSelected = false;
            if (current){
                isSelected = this.props.selectionModel.currentIndex().internalPointer() == index.internalPointer();
            }
            var arrow = (<span></span>)
            if (index.hasChildren()){
                arrow = (<span className="arrow">▶</span>)
            }
            return (<div className={isSelected ? 'QModelIndex selected' : 'QModelIndex'} onClick={this.itemClicked.bind(this, index)} key={index.row + i}>
                <img className="DecorationRole" src={data.DecorationRole} /><span className="DisplayRole">{data.DisplayRole}</span>{arrow}</div>)

        }, this);
        return (<div style={this.props.style} className="QListView">
                {items}
            </div>
        )
    }
});

var QToolButton = React.createClass({
    clicked: function(){
        this.refs.defaultAction.trigger();
    },
    mouseMove: function(evt){
        this.refs.defaultAction.mouseOver(evt);
    },
    render: function(){
        if (!this.props.defaultAction) return (<div></div>);
        var action = cloneWithProps(this.props.defaultAction, {ref: 'defaultAction'});
        var icon_style = {};
        var text_style = {};
        var style = {};
        if (this.props.toolButtonStyle == Qt.ToolButtonTextBesideIcon){
            icon_style.width = 10;
            style = {
                display: 'flex',
                height: 36,
                alignItems: 'center'
            };
        }
        var icon = "";
        if (this.props.defaultAction.props.icon) {
            icon = <img style={icon_style} className="QIcon" src={this.props.defaultAction.props.icon}/>
        }
        return (
            <div data-tooltip={this.props.defaultAction.props.toolTip} id={this.props.id} style={style} className="QToolButton"
                 onClick={this.clicked} onMouseMove={this.mouseMove} >
                {icon}
                <div style={text_style} className="text" >{this.props.defaultAction.props.text}</div>
                {action}
            </div>
        )
    }
});

var QWidget = React.createClass({
    render: function(){
        return (<div className="QWidget">{this.props.children}</div>)
    }
});

var QMenuBar = React.createClass({
    openMenu: function(menu){
        this.setState({activeMenu: menu});
    },
    closeMenu: function(menu){
        this.setState({activeMenu: null});
    },
    close: function(){
        this.setState({activeMenu: null});
    },
    getInitialState: function(){
        return {activeMenu: null};
    },
    onMouseMove: function(menu){
        if (this.state.activeMenu){
            if (this.state.activeMenu != menu){
                this.closeMenu(this.state.activeMenu);
                this.openMenu(menu);
            }
        }
    },
    renderMenus: function(){
        return React.Children.map(this.props.children, function(child){
            var button_menu = cloneWithProps(child, {
                ref: child.props.title, visible: this.state.activeMenu == child.props.title}
            );
            var cls = this.state.activeMenu == child.props.title ? 'MenuBarButton open' : 'MenuBarButton'
            return (
                <span className={cls} onMouseMove={this.onMouseMove.bind(this, child.props.title)}
                      onClick={this.openMenu.bind(this, child.props.title)} title={child.props.title} key={child.props.title}>
                    {child.props.title}
                    {button_menu}
                </span>)
        }, this);
    },

    render: function(){
        return (
            <div className="QMenuBar" >
                {this.renderMenus()}
            </div>
        )
    }
});

var QToolBar = React.createClass({
    render: function(){
        var children = React.Children.map(this.props.children, function(child){
            var action = child; // cloneWithProps(child, {ref: 'defaultAction'});
            if (parseInt(action.props.isSeparator)){
                return <div className="QAction separator"></div>
            }
            return (<QToolButton toolButtonStyle={this.props.toolButtonStyle} defaultAction={action}>{action}</QToolButton>);
        }, this);
        return (<div style={{height: this.props.height}} className="QToolBar">
            {children}
        </div>);
    }
});

var QLineEdit = React.createClass({
    render: function(){
        return (<input type="text" />)
    }
});

var QVBoxLayout = React.createClass({
    render: function() {
        return <div className="QVBoxLayout">{this.props.children}</div>
    }
});

var QHBoxLayout = React.createClass({
    render: function() {
        return <div className="QHBoxLayout">{this.props.children}</div>
    }
});

var QApplication = React.createClass({
    getInitialState: function(){
        return {windowWidth: 1200, windowHeight: 600, windowY: 0, windowX: 0, cursor: 'auto'};
    },

    startDrag: function(evt){
        if (evt.target.className != 'QAction'){
            this.refs.window.closeMenu();
        }
        if (evt.target.className == 'MenuBarArea' || evt.target.className == 'QMenuBar' || evt.target.className == 'ToolBarArea'){
            this.setState({move: {start: {x: evt.clientX, y: evt.clientY}}, initialState: this.state});
        } else {
            if (Math.abs(evt.clientX - this.state.windowWidth - this.state.windowX) < 40 &&
                Math.abs(evt.clientY - this.state.windowHeight - this.state.windowY) < 40) {
                this.setState({resize: {start: {x: evt.clientX, y: evt.clientY}}});
            }
        }
    },
    inResizeArea: function(evt){
        return Boolean(Math.abs(evt.clientX - this.state.windowWidth - this.state.windowX) < 40 &&
            Math.abs(evt.clientY - this.state.windowHeight - this.state.windowY) < 40);
    },
    onDrag: function(evt){
        if (this.inResizeArea(evt)){
            this.setState({cursor: 'nwse-resize'});
        } else {
            this.setState({cursor: null});
        }
        if (this.state.move){

            this.setState({
                windowX: this.state.initialState.windowX + evt.clientX - this.state.move.start.x,
                windowY: this.state.initialState.windowY + evt.clientY - this.state.move.start.y
            });
        }
        else if (this.state.resize){
            var move = {x:evt.clientX, y:evt.clientY};
            var start = this.state.resize.start;
            this.setState({windowWidth: move.x - this.state.windowX, windowHeight: move.y - this.state.windowY});
        }
    },

    stopDrag: function(evt){
        this.setState({resize: null, move:null, initialState: null});
    },
    render: function(){
        var windows = React.Children.map(this.props.children, function(window){
            return cloneWithProps(window, {
                windowX: this.state.windowX, windowY: this.state.windowY,
                windowWidth: this.state.windowWidth, windowHeight: this.state.windowHeight,
                ref: 'window'
            });
        }, this);
        var cls = this.state.cursor ? 'QApplication resizing' : 'QApplication';
        return (<div className={cls} onMouseMove={this.onDrag} onMouseDown={this.startDrag} onMouseUp={this.stopDrag}
                     style={{width: '100%', height: '100%'}}>
            {windows}
        </div>)
    }
});

var QMainWindow = React.createClass({
    displayName: 'QMainWindow',

    componentDidMount: function() {
        Signals.on('actionHover', this.onActionHover);
    },

    componentWillUnmount: function() {
        Signals.removeListener(this.onActionHover);
    },

    onActionHover: function(data){
        this.setState({currentAction: data.sender.props});
    },

    onLeftResize: function(event, data, handle) {
        size = data; //.size;
        this.setState({width: size.left - handle.offsetParent.offsetLeft});
    },
    onBottomResize: function(event, data, handle){
        this.setState({height: handle.offsetParent.offsetTop + handle.offsetParent.clientHeight - event.pageY});

    },
    getInitialState: function(){
        return {width: 200, height: 100, windowWidth: 1200, windowHeight: 600, currentAction: {}};
    },
    closeMenu: function(){
        this.refs.menuBar.close();
    },

    render: function(){
        var children = React.Children.toArray(this.props.children);
        var central_widget = children.filter(function(w){
            return w.props['qt-ref'] == 'centralWidget';
        })[0];
        var menu_bar = children.filter(function(w){
            return w.type == QMenuBar;
        })[0];
        menu_bar = cloneWithProps(menu_bar, {ref: 'menuBar'});
        var bottom_docks = children.filter(function(w){
            return w.type == QDockWidget && w.props.area == Qt.BottomDockWidgetArea;
        });
        var left_docks = children.filter(function(w){
            return w.type == QDockWidget && w.props.area == Qt.LeftDockWidgetArea;
        });
        var right_docks = children.filter(function(w){
            return w.type == QDockWidget && w.props.area == Qt.RightDockWidgetArea;
        });
        var toolbars = children.filter(function(w){
            return w.type == QToolBar;
        });
        central_widget = cloneWithProps(central_widget, {ref: 'centralWidget'});
        return (
            <div className="QMainWindow"
                 style={{width: this.props.windowWidth, height: this.props.windowHeight,
                     left: this.props.windowX, top: this.props.windowY}} >
                <div className="MenuBarArea" ref='menuBarArea'>{menu_bar}</div>
                <div className="ToolBarArea" ref='toolBarArea'>
                    {toolbars}
                    <div className="FreeToolBarSpace"></div>
                </div>
                <div className="MainArea">
                    <div className="LeftDockArea" style={{width: this.state.width}}>
                        {left_docks}
                    </div>
                    <ResizeHandle axis="x" onResize={this.onLeftResize}></ResizeHandle>
                    <div className="MiddleArea">
                        <div className="CentralArea" ref='centralWidget'>{central_widget}</div>
                        <ResizeHandle axis="y" onResize={this.onBottomResize}></ResizeHandle>
                        <div className="BottomDockArea" style={{height: this.state.height}}>{bottom_docks}</div>
                    </div>
                    <div className="RightDockArea">{right_docks}</div>
                </div>
                <div className="separator-horizontal"></div>
                <div className="StatusBarArea">
                    <div className="QStatusBar"><span><img className="statusbar-img" src={this.state.currentAction.icon} /></span>
                        <span className="statusbar-text">{this.state.currentAction.statusTip}</span>
                        <span className="shortcut">{this.state.currentAction.shortcut}</span>
                    </div>
                </div>
            </div>
        )
    }
});

var QMenu = React.createClass({
    getInitialState: function(){
        return {visible: this.props.visible};
    },
    open: function(){
        this.setState({visible: !this.state.visible});
    },
    close: function(){

    },
    render: function(){
        var children = React.Children.map(this.props.children, function(child){
            if (parseInt(child.props.isSeparator)){
                return <hr />
            }
            return cloneWithProps(child, {children: <div className="text">{child.props.text}<span className='shortcut'>{child.props.shortcut}</span></div>});
        }, this);
        return (<div className="QMenu" style={{display: this.props.visible ? 'inherit': 'none'}}>
            {children}
        </div>)

    }
});

var QAction = React.createClass({
    trigger: function(evt){
        console.log('ACTION TRIGGERED', this);
        evt.stopPropagation();
    },
    mouseOver: function(evt){
        Signals.emit('actionHover', {sender: this});
    },
    render: function(){
        return (<div className="QAction" onMouseMove={this.mouseOver} onClick={this.trigger}>{this.props.children}</div>)
    }
});

module.exports = {
    QTreeView: QTreeView,
    QTreeWidget: QTreeView,
    QWidget: QWidget,
    QToolButton: QToolButton,
    QLineEdit: QLineEdit,
    QColumnView: QColumnView,
    QListView: QListView,
    QStringListModel: QStringListModel,
    JSArrayModel: JSArrayModel,
    QItemSelectionModel: QItemSelectionModel,
    QDockWidget: QDockWidget,
    QHBoxLayout: QHBoxLayout,
    QVBoxLayout: QVBoxLayout,
    QToolBar: QToolBar,
    QMenuBar: QMenuBar,
    QApplication: QApplication,
    QMainWindow: QMainWindow,
    QAction: QAction,
    QMenu: QMenu
};

['QLabel', 'QLabel',
'QStackedWidget', 'QStackedLayout', 'QListWidget',
    'QItemDelegate', 'QSelectionModel', 'QAbstractProxyModel', 'QCompleter',
    'QObject', 'QAbstractItemView', 'QStyledItemDelegate',
    'QGridLayout', 'QPushButton', 'QHeaderView',
    'QStandardItemModel', 'QSortFilterProxyModel', 'QAbstractItemModel', 'QBoxLayout',
'QTabBar', 'QTabWidget', 'QSplitter', 'QScrollArea'].map(function(name){
    module.exports[name] = React.createClass({
        render: function(){
            return (<div className={name} >{this.props.children}</div>)
        }
    });
});