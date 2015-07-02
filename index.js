'use stricts';

var iptables = require('./ip.js');
var http = require("http");
var https = require('https');
var async = require('async');
var util = require('util');
var fs = require('fs');

var checkIpPad =  {
    index:0 //当前第几个
    ,isInit:false //是否初始化
    ,init:function(iplist){//初始化方法
        var _self  = this;

        //获取相应的值
        _self.arr = iplist;
        _self.len = iplist.length;


        if(_self.checkType==='random'){
            //执行随机查询
            _self.randomCheck();
        }else{
            //执行按顺序查询
            _self.listCheck();
        }

        _self.isInit = true;
    }
    ,randomCheck:function(){//随机查询
        var _self = this
            ,_num = _self.getRandom(0,_self.len-1)
            ,_str = _self.arr[_num];
        ;
        _self.checkType='random';
        _self.index = _num;
        _self._cacheIndex = _self._cacheIndex + '_'+_num+'_';


        _self.checkStr(_str);
    }
    ,listCheck:function(){//顺序查找
        var _self = this
            ,_num = _self.isInit?_self.index+1:_self.index
            ,_str
        ;
        if(_num>=_self.len){
            return false;
        }

        _self.checkType='list';
        _self.index = _num;
        _str = _self.arr[_num];
        _self.checkStr(_str);
    }
    ,getRandom:function(t1,t2){//获取随机数
    	var _self = this
    		,_num = Math.floor(Math.random()*(t2-t1)+t1)
    		,_flag = true
    		,_cache = _self._cacheIndex
    	;
    	while(_flag){
    		if(_cache.indexOf('_'+_num+'_')===-1){
    			_flag = false;
    		}else{
    			_num = Math.floor(Math.random()*(t2-t1)+t1);
    		}
    	}
        return _num;
    }
    ,checkStr:function(str){//检查并转换
        var arr = str.split('.')
            ,_ipStr = arr[0]+'.'+arr[1]+'.'+arr[2]+'.'
            ,_range = arr[3].split('-')
            ,_start = _range[0] || 1
            ,_end = _range[1]
            ,i = _start
            ,_self = this
        ;
        _self._ipStr = _ipStr;
        for(;i<_end;i++){
            _self.pushTask(i);
        }
    }
    ,pushTask:function(i){ //添加任务
        var _self =this
            ,_ipStr = _self._ipStr
        ;
        q.push({name:'task-'+i, run: function(cb){
            util.log('t'+ i +' is running, waiting tasks: '+ q.length());
            _self.reqList[i] = httpsGet(_ipStr+i,cb);
        }}, function(err) {//执行完成
            util.log('t'+ i +' executed');
        });
    }
    ,len:0//iplist 总长度 多少个
    ,arr:[]//iplist
    ,_cacheIndex:'_'
    ,_ipStr:''//当前执行的ip段
    ,checkType:'random' //查找的方式  random 随机查询  list是按顺序查询
    ,addGoodIp:function(ip){
        var _self = this;
        _self.result.push(ip);
    }
    ,result:[]//结果  可用的ip
    ,reqList:[]//请求对象列表
    ,timeout:1000
    ,threadNum:15 //同时执行多少个任务
    ,ipNum:5 //至少要找到多少个ip
    ,finishTask:function(){ //任务执行完
    	var _self = this
    		,_result = _self.result
    	;

        util.log('all tasks have been processed');

        console.log(_self._ipStr);
        console.log(_result);

        //如果可以的IP数量 不满足设置的值
        if(_result.length<_self.ipNum){
        	_self[_self.checkType+'Check']();
        }else{
            console.log(_result.length);
        	_self.writeToTxt(_result);
        }

    }
    ,writeToTxt:function(result){
        var _self = this
            ,_str = result.join('|')
        ;
        fs.writeFileSync('iplist.txt',_str,'utf8');
        _self.replaceFile(_str);
    }
    ,proxyFile:'proxy.ini' //goagent中proxy.ini 文件的位置
    ,replaceFile:function(str){ //替换proxy.ini中的google_hk内容
      var _self = this
        ,_file = _self.proxyFile
        ,_con = ''
        ,_start = 0
        ,_end = 0
        ,_recon = ''
      ;
      if(!fs.existsSync(_file)){
          util.log(_file+'不存在！');
          return false;
      }

      _con = fs.readFileSync(_file,'utf8');
      _start = _con.indexOf('google_hk');
      _end = _con.indexOf('google_talk');
      _recon = _con.slice(_start,_end);
      _con = _con.replace(_recon,'google_hk ='+str+'\n');
      fs.writeFileSync(_file,_con,'utf8');
    }
}

var q = async.queue(function(task, callback) {
    util.log('worker is processing task: '+task.name);
    task.run(callback);
}, checkIpPad.threadNum);
/**
* 监听：如果某次push操作后，任务数将达到或超过worker数量时，将调用该函数
*/
q.saturated = function() {
    util.log('all workers to be used');
}

/**
* 监听：当最后一个任务交给worker时，将调用该函数
*/
q.empty = function() {
    util.log('no more tasks wating');
}

/**
* 监听：当所有任务都执行完以后，将调用该函数
*/
q.drain = function() {
    checkIpPad.finishTask();
}

function httpGet(ip,cb){
    var req = http.get('http://'+ip)
        ,err=false
    ;

    function endAysnc(){
        req.abort();

        if(!err){
            err = true;
            cb();
        }
    }

    req.on('response',function(res){
        //修改了判断，直接用header信息中server的判断，加快了判断速度
        if(res.headers.server === 'gws'){
            checkIpPad.addGoodIp(ip);
        }
        res.destroy();

        endAysnc();
    })
    .on('error',function(err){
        endAysnc();
        //throw err;
    })
    .setTimeout(checkIpPad.timeout,function(){
        endAysnc();
    });

    return req;
}


function httpsGet(ip,cb){
    var httpsOptions = {
            hostname: ip,
            port: 443,
            path: '/',
            method: 'GET',
            cert: fs.readFileSync('cacert.pem')
        },
        req,err=false
    ;
    function endAysnc(){
        if(req && req.abort){
            req.abort();
        }
        

        if(!err){
            err = true;
            cb();
        }
    }
    try{
        req = https.request(httpsOptions, function(res) {
            console.log(ip,res.status);

            res.destroy();

            checkIpPad.addGoodIp(ip);//加入
            cb();
        });
        req.on('error',function(err){
            var cert, i, item, len, flag=false, subjectaltname;
            cert = err.cert || {};
            subjectaltname = cert.subjectaltname || [];

            if (subjectaltname.length) {
                subjectaltname = subjectaltname.split(',');
                results = [];
                for (i = 0, len = subjectaltname.length; i < len; i++) {
                    item = subjectaltname[i];
                    if(item.indexOf('accounts.google.com')>-1){
                        flag = true;
                        continue;
                    }
                }
            }

            if(flag){
                checkIpPad.addGoodIp(ip);//加入
                endAysnc();
            }else{ 
                //httpGet(ip,cb);
                endAysnc();
            }
        })
        .setTimeout(1000,function(){
            endAysnc();
        })
        ;

    }catch(err){
        endAysnc();
    }
}


checkIpPad.init(iptables);
