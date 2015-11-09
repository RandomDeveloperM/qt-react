import time
import vortex_ui

from qtparser.parser import QtWidgetParser, QtReactConverter

parser = QtWidgetParser(
    exclude_classes=('QContextMenu', 'QPropertyAnimation', 'QAbstractListModel',
                     'QStyledItemDelegate', 'QObject', 'QLayout', 'QScrollBar', 'QObject',),
    exclude_ids=('ScriptEditorDock', 'SettingsEditorViewDock', 'VX_Extension_Viewer',
                 'VX_Object_Inspecter_View', 'VX_Jobbox_View',),
    exclude_properties=('visible', 'html', 'styleSheet', 'font',),
    window='Vortex   -'
)
converter = QtReactConverter(widget_parser=parser)

all_components = converter.all_components

check_components_string = """
[%s].map(function(name){
    if (!Qt[name]){
        throw "missing component " + name;
    }
});
""" % (','.join(["'" + n + "'" for n in all_components]))

require_string = """
var React = require('react');
var ReactDOM = require('react-dom');
var Qt = require('./qt/qt.jsx');
"""

def write_jsx(converter):
    print '== parse qt window =='
    html, models = converter.convert()
    print '== write jsx == '
    with open('js/vortex.jsx', 'w') as f:
        f.write(require_string)
        f.write(models)
        f.write('ReactDOM.render(%s, document.getElementById("content"));' % html)

def main(converter):
    countdown = 2.0
    t = time.time()
    app = vortex_ui.app
    while 1:
        if app.hasPendingEvents():
            app.processEvents()
        if time.time() - t > countdown:
            t = time.time()
            write_jsx(converter)
        time.sleep(0.01)

if __name__ == '__main__':
    main(converter)