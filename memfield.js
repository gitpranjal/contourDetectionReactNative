/*
MemField
Version 1.0
Copyright Patrick Roberts http://patrickroberts.ca
MIT license

Requires jQuery

Default is that the value is loaded from memory for the url (without querystring) + name to remember field as. Helps to ensure I don't fill up localstorage.

Example:
<input name=whatever data-remember-as="whateverInfo">

- would be nice to debounce storing while value still changing
*/

$(function() {
    const url = location.host + location.pathname;// + location.search

    function parseQueryString(s) {
        var re = /([^&=]+)=([^&]*)/g, queryParamMatch, result = {};
        while (queryParamMatch = re.exec(s !== undefined ? s : location.search.slice(1)))
            result[decodeURIComponent(queryParamMatch[1])] = decodeURIComponent(queryParamMatch[2].replace(/\+/g, ' '));
        return result;
    }
    const queryParams = parseQueryString();
    
    function getFieldKey(elem) {
        return 'memfield:' + url + '>>' + elem.attr('data-remember-as');
    }
    
    $(':input[data-remember-as]').each(function () {
        const elem = $(this), name = elem.attr('data-remember-as'), requires = elem.attr('data-remember-requires'), v = localStorage[getFieldKey(elem)];
        //console.log(requires, queryParams[requires], getFieldKey(elem) + '>>requires', localStorage[getFieldKey(elem) + '>>requires']);
        if ((!requires || queryParams[requires] === localStorage[getFieldKey(elem) + '>>requires']) && v !== undefined) {
            if (elem.is(':radio')) {
                $(':radio[data-remember-as=' + name + '][value=' + v + ']:checked').prop('checked', true);
            } else if (elem.is(':checkbox')) {
                elem.prop('checked', eval(v));
            } else {
                elem.val(v);
                try { console.log('remembering', elem, name, v, elem.val()); } catch (e) {}
            }
        }
    });
    
    function store(elem) {
        var v, k = getFieldKey(elem), requires = elem.attr('data-remember-requires');
        if (elem.is(':radio')) {
            v = $(':radio[name=' + elem.attr('name') + ']:checked').val();
        } else if (elem.is(':checkbox')) {
            v = elem.prop('checked');
        } else {
            v = elem.val();
        }
        try { // localstorage is broken in safari private browsing
            localStorage[k] = v;
            if (requires) {
                localStorage[k + '>>requires'] = queryParams[requires];
            }
            console.log('storing', elem, getFieldKey(elem), v, requires);
        } catch (e) {}
    }
    
    $('body').on('change keyup', ':input[data-remember-as]', function () {
        store($(this));
    });
    
    function storeAll() {
        $(':input[data-remember-as]').each(function () {
            store($(this));
        });
    }
    $(window).on('unload beforeunload', storeAll);
});
