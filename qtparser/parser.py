import random
from PyQt4.QtCore import *
from PyQt4.QtGui import *
from StringIO import StringIO
from PyQt4 import QtCore, QtGui


def class_bases(cls):
    yield cls
    for base in cls.__bases__:
        yield base
        for subbase in class_bases(base):
            yield subbase

def random_string():
    chars = list('abcdefghijklmnopqrstuvxy')
    random.shuffle(chars)
    return ''.join(chars[:10])

def src_from_icon(value):
    if not value:
        return ''
    pixmap = value.pixmap(128)
    value = ''
    if pixmap.cacheKey():
        filename = 'icons/%s.png' % (pixmap.cacheKey())
        pixmap.save(filename)
        value = filename
    return value

def model_data(model, row, root):
    columns = ["column-%s" % c for c in range(model.columnCount())]
    indexes = [model.index(row, col, root) for col, _ in enumerate(columns)]
    result = {}

    for c, index in zip(columns, indexes):
        result[c] = {
            'DisplayRole': str(model.data(index).toString()),
            'DecorationRole': src_from_icon(model.data(index, role=Qt.DecorationRole).toPyObject())
        }
    return result

def model_index_iter(model, root=QModelIndex(), parent=None):
    for row in range(model.rowCount(root)):
        column_data = model_data(model, row, root)
        yield (parent, column_data,)
        for child_parent, child_data in model_index_iter(model, model.index(row, 0, root), column_data):
            yield (child_parent, child_data,)

def model_row_data(model):
    result = []
    for parent, children in model_index_iter(model):
        if parent is None:
            result.append(children)
        else:
            parent.setdefault('children', [])
            parent['children'].append(children)
    return result

def model_column_data(model):
    columns = [{'name': "column-%s" % c, 'display': 'column-%s' % c} for c in range(model.columnCount())]
    return columns



class QtWidgetParser(object):
    def __init__(self, exclude_classes=tuple(), exclude_properties=tuple(), exclude_ids=tuple(), window=None):
        self.qobjects = {}
        self.models = []
        self.methods = {n.lstrip('parse_'): getattr(self, n) for n, v in self.__class__.__dict__.items()
                        if n.startswith('parse_Q')}
        self.qt_names = set(QtCore.__dict__.keys()) | set(QtGui.__dict__.keys())
        self.all_components = set()
        self.exclude_classes = exclude_classes
        self.exclude_ids = exclude_ids
        self.exclude_properties = exclude_properties
        self.window = window

    def parse_QApplication(self, app):
        windows = [self.parse_qobject(w) for w in app.topLevelWidgets() if isinstance(w, QMainWindow)]
        if self.window:
            windows = [w for w in windows if w['props']['windowTitle'].strip('\'"').startswith(self.window)]
        return {'children': windows}

    def parse_QAction(self, action):
        return {'props': {
            'isSeparator': '"' + str(int(action.isSeparator())) + '"',
            'shortcut': '"' + str(action.shortcut().toString()) + '"'
        }}

    def parse_QAbstractItemModel(self, model):
        ref = str(model.objectName())
        if not ref:
            ref = random_string()
        try:
            model.columnCount()
        except:
            row_data = []
            column_data = []
        else:
            row_data = model_row_data(model)
            column_data = model_column_data(model)
        result = {
            'reference': ref, 'parent': None,
            'construct': 'JSArrayModel(%s, %s)' % (row_data, column_data)
        }
        self.models.append(result)
        return result

    def parse_QItemSelectionModel(self, model):
        parent = self.parse_qobject(model.model())
        ref = parent['reference'] + '_selection'
        result = {
            'reference': ref, 'parent': parent,
            'construct': 'QItemSelectionModel(%s)' % parent['reference']
        }
        parent['children'].append(result)
        self.models.append(result)
        return result

    def parse_QLayout(self, layout):
        children = [layout.itemAt(c).widget() or layout.itemAt(c).layout()
                    for c in range(layout.count())]
        children = [self.parse_qobject(c) for c in children if c]
        return {'children': children}

    def parse_QWidget(self, widget):
        if widget.layout():
            return {'children': [self.parse_qobject(widget.layout())]}
        return {'children': []}

    def parse_QObject(self, qobject):
        return {'children': []}

    def parse_children(self, qobject):
        return {'children': [self.parse_qobject(c) for c in qobject.children()]}

    def parse_container(self, container):
        return {'children': [self.parse_qobject(container.widget())]}
    parse_QScrollArea = parse_container
    parse_QDockWidget = parse_container

    def parse_actions(self, menubar):
        return {'children': [self.parse_qobject(act) for act in menubar.actions()]}
    parse_QMenu = parse_actions
    parse_QToolBar = parse_actions

    def parse_QToolButton(self, btn):
        if btn.defaultAction():
            return {'children': [self.parse_qobject(btn.defaultAction())]}
        return {'children': []}

    def parse_QMenuBar(self, menubar):
        return {'children': [self.parse_qobject(act.menu()) for act in menubar.actions()]}

    def parse_QMainWindow(self, window):
        menubar = self.parse_qobject(window.menuBar(), qt_ref='menuBar', parent=window)
        central = self.parse_qobject(window.centralWidget(), qt_ref='centralWidget', parent=window)
        toolbars = [self.parse_qobject(tb, parent=window, props={
            'area': '"' + str(window.toolBarArea(tb)) + '"'
        }) for tb in window.children() if isinstance(tb, QToolBar)]
        docks = [self.parse_qobject(dock, parent=window, props={
            'area': '"' + str(window.dockWidgetArea(dock)) + '"'
        }) for dock in window.children() if isinstance(dock, QDockWidget)]
        return {'children': [central, menubar] + toolbars + docks}

    def parse_QAbstractItemView(self, view):
        model = self.parse_qobject(view.model())
        selection = self.parse_qobject(view.selectionModel())
        result = {
            'props': {'model': "{%s}" % model['reference'], 'selectionModel': "{%s}" % selection['reference']}
        }
        return result

    def __parse_QTreeWidget(self, tree):
        result = {}
        result['children'] = [self.parse_qobject(c) for c in tree.children() if c]
        return result

    def parse_qobject(self, qobject, qt_ref=None, parent=None, props=None):
        if self.qtype(qobject) == 'QWidget' and hasattr(qobject, 'layout') and qobject.layout():
            qobject = qobject.layout()
        if qobject in self.qobjects:
            return self.qobjects[qobject]
        item = self.qobject_method(qobject)(qobject)
        item['cls'] = self.qtype(qobject)
        item.setdefault('children', [])
        item.setdefault('props', {})
        item['props'].update(self.get_properties(qobject))
        item['props'].update(props or {})
        if qt_ref:
            item['props']['qt-ref'] = '"' + qt_ref + '"'
        item['objectName'] = str(qobject.objectName())
        item['children'] = [c for c in item['children']
                            if c['cls'] not in self.exclude_classes and c['objectName'] not in self.exclude_ids]
        self.qobjects[qobject] = item
        self.all_components.add(item['cls'])
        return item

    def qobject_method(self, qobject):
        names = []
        for base in class_bases(qobject.__class__):
            names.append(base.__name__)
            if base.__name__ in self.methods:
                return self.methods[base.__name__]
        raise RuntimeError('No available parse-method for: %s, found: %s' % (qobject.__class__, names))

    def qtype(self, widget):
        class_names = map(lambda c: c.__name__, class_bases(widget.__class__))
        for name in class_names:
            if name in self.qt_names:
                return name

    def get_properties(self, widget):
        meta = widget.metaObject()
        props = {}

        try:
            default = getattr(QtGui, self.qtype(widget))()
        except:
            default = None  # QWidget()
        for i in range(meta.propertyCount()):
            prop = meta.property(i)
            name = prop.name()
            if prop.isReadable() and prop.isWritable() and prop.name() not in self.exclude_properties:
                value = prop.read(widget).toPyObject()
                if name == 'icon':
                    value = src_from_icon(value)
                else:
                    value = prop.read(widget).toString()
                value = '"' + str(value) + '"'
                if default is None:
                    props[str(prop.name())] = value
                else:
                    default_value = prop.read(default).toString()
                    if default_value != value:
                        props[str(prop.name())] = value
        props['id'] = props.pop('objectName', '')
        if hasattr(widget, 'normalGeometry'):
            geo = widget.normalGeometry()
            # need this magic number to match up qt with browser, might be a retina issue
            props.update({'width': '"' + str(int(geo.width()*0.746268657)) + '"',
                          'height': '"' + str(int(widget.height()*0.746268657)) + '"'})
        return props


class QtReactConverter(object):
    def __init__(self, default_properties=None, widget_parser=None):
        self.all_components = set()
        self.namespace = 'Qt'
        self.ident = 0
        self.widgets = set()
        self.default_properties = default_properties
        self.widget_parser = widget_parser or QtWidgetParser()

    def widget_start(self, widget, n):
        self.all_components.add(widget['cls'])
        self.write('\n%s<%s.%s %s>' % (
            ' ' * self.ident, self.namespace, widget['cls'],
            ' '.join(['%s=%s' % (k, v) for k, v in widget['props'].items()])))
        self.ident += 4

    def widget_end(self, widget, n):
        self.ident -= 4
        ident = self.ident
        if n > 0:
            self.write('\n')
        else:
            ident = 0
        self.write('%s</%s.%s>' % (' ' * ident, self.namespace, widget['cls']))

    def write(self, string):
        self.output.write(string)

    def children(self, widget):
        return widget['children']

    def widget_iter(self, root):
        for widget in self.children(root):
            yield ('START', widget, 0,)
            n_children = 0
            for action, subchild, snc in self.widget_iter(widget):
                n_children += 1
                yield (action, subchild, snc,)
            yield ('END', widget, n_children,)

    def convert(self, root=QApplication.instance()):
        self.ident = 0
        root = self.widget_parser.parse_qobject(root)
        self.output = StringIO()
        self.model_output = StringIO()

        for model in self.widget_parser.models:
            self.model_output.write("var %s = %s.%s;\n" % (model['reference'], self.namespace, model['construct']))

        self.widget_start(root, 0)
        for action, widget, nc in self.widget_iter(root):
            if action == 'START':
                self.widget_start(widget, nc)
            elif action == 'END':
                self.widget_end(widget, nc)
        self.widget_end(root, 1)

        return self.output.getvalue(), self.model_output.getvalue()
