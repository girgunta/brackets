/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, $, window */

/**
 * Manages parts of the status bar related to the current editor's state.
 */
define(function (require, exports, module) {
    "use strict";
    
    // Load dependent modules
    var AppInit             = require("utils/AppInit"),
        AnimationUtils      = require("utils/AnimationUtils"),
        EditorManager       = require("editor/EditorManager"),
        Editor              = require("editor/Editor").Editor,
        KeyEvent            = require("utils/KeyEvent"),
        StatusBar           = require("widgets/StatusBar"),
        Strings             = require("strings"),
        StringUtils         = require("utils/StringUtils"),
        ValidationUtils     = require("utils/ValidationUtils");
    
    /* StatusBar indicators */
    var $languageInfo,
        $cursorInfo,
        $fileInfo,
        $indentType,
        $indentWidthLabel,
        $indentWidthInput,
        $statusOverwrite;
    
    
    function _formatCountable(number, singularStr, pluralStr) {
        return StringUtils.format(number > 1 ? pluralStr : singularStr, number);
    }
    
    function _updateLanguageInfo(editor) {
        $languageInfo.text(editor.document.getLanguage().getName());
    }
    
    function _updateFileInfo(editor) {
        var lines = editor.lineCount();
        $fileInfo.text(_formatCountable(lines, Strings.STATUSBAR_LINE_COUNT_SINGULAR, Strings.STATUSBAR_LINE_COUNT_PLURAL));
    }
    
    function _updateIndentType(editor) {
        var indentWithTabs = editor.getUseTabChar();
        $indentType.text(indentWithTabs ? Strings.STATUSBAR_TAB_SIZE : Strings.STATUSBAR_SPACES);
        $indentType.attr("title", indentWithTabs ? Strings.STATUSBAR_INDENT_TOOLTIP_SPACES : Strings.STATUSBAR_INDENT_TOOLTIP_TABS);
        $indentWidthLabel.attr("title", indentWithTabs ? Strings.STATUSBAR_INDENT_SIZE_TOOLTIP_TABS : Strings.STATUSBAR_INDENT_SIZE_TOOLTIP_SPACES);
    }

    function _getIndentSize(editor) {
        return editor.getUseTabChar() ? editor.getTabSize() : editor.getSpaceUnits();
    }
    
    function _updateIndentSize(editor) {
        var size = _getIndentSize(editor);
        $indentWidthLabel.text(size);
        $indentWidthInput.val(size);
    }
    
    function _toggleIndentType() {
        var current = EditorManager.getActiveEditor();
        current.setUseTabChar(!current.getUseTabChar());
        _updateIndentType(current);
        _updateIndentSize(current);
    }
    
    function _updateCursorInfo(event, editor) {
        editor = editor || EditorManager.getActiveEditor();

        // compute columns, account for tab size
        var cursor = editor.getCursorPos(true);
        
        var cursorStr = StringUtils.format(Strings.STATUSBAR_CURSOR_POSITION, cursor.line + 1, cursor.ch + 1);
        
        var sels = editor.getSelections(),
            selStr = "";

        if (sels.length > 1) {
            selStr = StringUtils.format(Strings.STATUSBAR_SELECTION_MULTIPLE, sels.length);
        } else if (editor.hasSelection()) {
            var sel = sels[0];
            if (sel.start.line !== sel.end.line) {
                var lines = sel.end.line - sel.start.line + 1;
                if (sel.end.ch === 0) {
                    lines--;  // end line is exclusive if ch is 0, inclusive otherwise
                }
                selStr = _formatCountable(lines, Strings.STATUSBAR_SELECTION_LINE_SINGULAR, Strings.STATUSBAR_SELECTION_LINE_PLURAL);
            } else {
                var cols = editor.getColOffset(sel.end) - editor.getColOffset(sel.start);  // end ch is exclusive always
                selStr = _formatCountable(cols, Strings.STATUSBAR_SELECTION_CH_SINGULAR, Strings.STATUSBAR_SELECTION_CH_PLURAL);
            }
        }
        $cursorInfo.text(cursorStr + selStr);
    }
    
    function _changeIndentWidth(editor, value) {
        $indentWidthLabel.removeClass("hidden");
        $indentWidthInput.addClass("hidden");
        
        // remove all event handlers from the input field
        $indentWidthInput.off("blur keyup");
        
        // restore focus to the editor
        EditorManager.focusEditor();
        
        if (!ValidationUtils.isInteger(value)) {
            return;
        }
        
        if (editor.getUseTabChar()) {
            value = Math.max(Math.min(Math.floor(value), Editor.MAX_TAB_SIZE), Editor.MIN_TAB_SIZE);
            editor.setTabSize(value);
        } else {
            value = Math.max(Math.min(Math.floor(value), Editor.MAX_SPACE_UNITS), Editor.MIN_SPACE_UNITS);
            editor.setSpaceUnits(value);
        }

        // update indicator
        _updateIndentSize(editor);

        // column position may change when tab size changes
        _updateCursorInfo();
    }
    
    function _updateOverwriteLabel(event, editor, newstate, doNotAnimate) {
        if ($statusOverwrite.text() === (newstate ? Strings.STATUSBAR_OVERWRITE : Strings.STATUSBAR_INSERT)) {
            // label already up-to-date
            return;
        }

        $statusOverwrite.text(newstate ? Strings.STATUSBAR_OVERWRITE : Strings.STATUSBAR_INSERT);

        if (!doNotAnimate) {
            AnimationUtils.animateUsingClass($statusOverwrite[0], "flash");
        }
    }

    function _updateEditorOverwriteMode(event) {
        var editor = EditorManager.getActiveEditor(),
            newstate = !editor._codeMirror.state.overwrite;

        // update label with no transition
        _updateOverwriteLabel(event, editor, newstate, true);
        editor.toggleOverwrite(newstate);
    }
    
    function _initOverwriteMode(currentEditor) {
        currentEditor.toggleOverwrite($statusOverwrite.text() === Strings.STATUSBAR_OVERWRITE);
    }
    
    function _onActiveEditorChange(event, current, previous) {
        if (previous) {
            $(previous).off(".statusbar");
            $(previous.document).off(".statusbar");
            previous.document.releaseRef();
        }
        
        if (!current) {
            StatusBar.hide();  // calls resizeEditor() if needed
        } else {
            StatusBar.show();  // calls resizeEditor() if needed
            
            $(current).on("cursorActivity.statusbar", _updateCursorInfo);
            $(current).on("optionChange.statusbar", function () {
                _updateIndentType(current);
                _updateIndentSize(current);
            });
            $(current).on("change.statusbar", function () {
                // async update to keep typing speed smooth
                window.setTimeout(function () { _updateFileInfo(current); }, 0);
            });
            $(current).on("overwriteToggle.statusbar", _updateOverwriteLabel);
            
            current.document.addRef();
            $(current.document).on("languageChanged.statusbar", function () { _updateLanguageInfo(current); });
            
            _updateCursorInfo(null, current);
            _updateLanguageInfo(current);
            _updateFileInfo(current);
            _initOverwriteMode(current);
            _updateIndentType(current);
            _updateIndentSize(current);
        }
    }
    
    function _init() {
        $languageInfo       = $("#status-language");
        $cursorInfo         = $("#status-cursor");
        $fileInfo           = $("#status-file");
        $indentType         = $("#indent-type");
        $indentWidthLabel   = $("#indent-width-label");
        $indentWidthInput   = $("#indent-width-input");
        $statusOverwrite    = $("#status-overwrite");
        
        // indentation event handlers
        $indentType.on("click", _toggleIndentType);
        $indentWidthLabel
            .on("click", function () {
                // update the input value before displaying
                var current = EditorManager.getActiveEditor();
                $indentWidthInput.val(_getIndentSize(current));

                $indentWidthLabel.addClass("hidden");
                $indentWidthInput.removeClass("hidden");
                $indentWidthInput.focus();
        
                $indentWidthInput
                    .on("blur", function () {
                        _changeIndentWidth(current, $indentWidthInput.val());
                    })
                    .on("keyup", function (event) {
                        if (event.keyCode === KeyEvent.DOM_VK_RETURN) {
                            $indentWidthInput.blur();
                        } else if (event.keyCode === KeyEvent.DOM_VK_ESCAPE) {
                            _changeIndentWidth(current, false);
                        }
                    });
            });

        $indentWidthInput.focus(function () { $indentWidthInput.select(); });

        $statusOverwrite.on("click", _updateEditorOverwriteMode);
        
        _onActiveEditorChange(null, EditorManager.getActiveEditor(), null);
    }

    // Initialize: status bar focused listener
    $(EditorManager).on("activeEditorChange", _onActiveEditorChange);
    
    AppInit.htmlReady(_init);
});
