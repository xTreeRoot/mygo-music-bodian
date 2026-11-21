# Read-only host snapshots; native libraries and synthetic account state stay in a temporary directory.
import argparse,base64,ctypes,hashlib,json,pathlib,re,subprocess,tempfile,urllib.parse
parser=argparse.ArgumentParser(description='Run the release bundle in MB iOS/Android native QuickJS without touching apps or devices.')
parser.add_argument('--mb',required=True,type=pathlib.Path,help='Read-only local MB repository containing ios and android refs')
options=parser.parse_args()
plugin=pathlib.Path(__file__).resolve().parent.parent
workspace=tempfile.TemporaryDirectory(prefix='bodian-native-')
root=pathlib.Path(workspace.name)
snapshots={platform:subprocess.check_output(['git','rev-parse',platform],cwd=options.mb,text=True).strip() for platform in ['ios','android']}
for platform,revision in snapshots.items():
 paths=subprocess.check_output(['git','ls-tree','-r','--name-only',revision,'ios/Sources/MBJavaScript'],cwd=options.mb,text=True).splitlines()
 paths+=['ios/Sources/MBFoundation/Resources/PluginBootstrap.js']
 for name in paths:
  target=root/'runtime'/platform/name
  target.parent.mkdir(parents=True,exist_ok=True)
  target.write_bytes(subprocess.check_output(['git','show',revision+':'+name],cwd=options.mb))
 directory=root/'runtime'/platform/'ios/Sources/MBJavaScript'
 command=['clang','-shared','-fPIC','-O2','-DCONFIG_VERSION="2026-06-04"','-I'+str(directory/'include'),str(directory/'MBJavaScript.c')]+[str(directory/'vendor'/name) for name in ['quickjs.c','dtoa.c','libregexp.c','libunicode.c','cutils.c']]+['-o',str(root/'runtime'/(platform+'.dylib'))]
 subprocess.run(command,check=True,capture_output=True)
 print('Snapshot',platform,revision)
lyric='[00:01.00]中文歌词🎵'
class Runtime:
 def __init__(self,platform):
  self.lib=ctypes.CDLL(str(root/'runtime'/(platform+'.dylib')))
  self.storage={};self.prompts=[];self.requests=[];self.events={};self.clock=0
  self.callback=ctypes.CFUNCTYPE(ctypes.c_void_p,ctypes.c_void_p,ctypes.c_char_p,ctypes.c_char_p)(self.host)
  self.lib.mbjs_create.argtypes=[type(self.callback),ctypes.c_void_p,ctypes.c_size_t];self.lib.mbjs_create.restype=ctypes.c_void_p
  self.lib.mbjs_evaluate.argtypes=[ctypes.c_void_p,ctypes.c_char_p,ctypes.c_char_p,ctypes.c_int,ctypes.c_int]
  self.lib.mbjs_start.argtypes=[ctypes.c_void_p,ctypes.c_char_p,ctypes.c_char_p,ctypes.c_int]
  self.lib.mbjs_settle.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_char_p,ctypes.c_int]
  for name in ['mbjs_take_event','mbjs_result']:
   getattr(self.lib,name).argtypes=[ctypes.c_void_p];getattr(self.lib,name).restype=ctypes.c_void_p
  self.lib.mbjs_free_string.argtypes=[ctypes.c_void_p];self.lib.mbjs_destroy.argtypes=[ctypes.c_void_p]
  self.libc=ctypes.CDLL(None);self.libc.strdup.argtypes=[ctypes.c_char_p];self.libc.strdup.restype=ctypes.c_void_p
  self.pointer=self.lib.mbjs_create(self.callback,None,256<<20)
  bootstrap=(root/'runtime'/platform/'ios/Sources/MBFoundation/Resources/PluginBootstrap.js').read_text()
  if platform=='android':bootstrap=bootstrap.replace('platform: "ios", arch: "arm64"','platform: "android", arch: "arm64"')
  self.finish(self.lib.mbjs_evaluate(self.pointer,bootstrap.encode(),b'host.js',0,100))
  self.finish(self.lib.mbjs_evaluate(self.pointer,(plugin/'index.js').read_bytes(),b'plugin.js',1,500))
 def text(self,name):
  ptr=getattr(self.lib,name)(self.pointer)
  if not ptr:return None
  value=ctypes.string_at(ptr).decode();self.lib.mbjs_free_string(ptr);return value
 def host(self,_opaque,operation,arguments):
  try:
   op=operation.decode();a=json.loads(arguments)
   if op=='storage.get':v=self.storage.get(a[0])
   elif op=='storage.set':self.storage[a[0]]=a[1];v=None
   elif op=='storage.remove':self.storage.pop(a[0],None);v=None
   elif op=='t':v=a[0]
   elif op=='setting':v=''
   elif op=='language':v='zh-CN'
   elif op=='console':v=None
   elif op=='prompt':self.prompts.append(a[0]);v=None
   elif op=='md5':v=hashlib.md5(a[0].encode()).hexdigest()
   elif op=='base64.decode':v=base64.b64decode(a[0]).decode('latin1')
   elif op=='base64.encode':v=base64.b64encode(a[0].encode('latin1')).decode()
   elif op=='url':
    u=urllib.parse.urlsplit(urllib.parse.urljoin(a[1],a[0]) if len(a)>1 else a[0]);v={'href':u.geturl(),'protocol':u.scheme+':','host':u.netloc,'hostname':u.hostname or '', 'pathname':u.path or '/', 'search':'?'+u.query if u.query else '', 'hash':'#'+u.fragment if u.fragment else ''}
   else:raise ValueError('Unexpected operation '+op)
   out={'value':v}
  except Exception as e:out={'error':str(e)}
  return self.libc.strdup(json.dumps(out,ensure_ascii=False).encode())
 def response(self,event):
  address=event['url'];self.requests.append(event)
  headers={};cookies=[];data=None;raw=None
  url=urllib.parse.urlsplit(address);path=url.path.removeprefix('/api/');query=urllib.parse.parse_qs(url.query)
  if path=='search/music/list':
   page=int(query.get('pn',['0'])[0]);data={'resultList':[{'id':str(page*30+i+1),'name':'歌曲','duration':123,'album':'专辑','albumId':8,'artist':'歌手','artistId':9} for i in range(30)]}
  elif path=='ucenter/login/qrCode':data={'qrCode':'fixture'}
  elif path=='ucenter/login/qrCodeStatus':data={'status':3}
  elif path=='ucenter/users/login':data={'id':'12345','token':'fixture-token','userInfo':{'id':'12345','nickname':'测试账号'}}
  elif path=='ucenter/users/pub/12345':data={'userInfo':{'id':'12345','nickname':'测试账号'}}
  elif path=='play/music/v2/audioUrl':data={'audioUrl':'https://bd-er.kuwo.cn/fixture.mp3','audioHttpsUrl':'https://bd-er.kuwo.cn/fixture.mp3','format':'mp3','bitrate':128,'size':'1Mb'}
  elif path=='/mobi.s':data={'content':base64.b64encode(lyric.encode()).decode()}
  else:raise ValueError('Unexpected API '+path)
  data={'code':200,'data':data}
  if data is not None:raw=json.dumps(data,ensure_ascii=False).encode()
  return {'status':200,'url':address,'headers':headers,'setCookies':cookies,'body':raw.decode(errors='replace'),'base64':base64.b64encode(raw).decode()}
 def finish(self,status):
  # Network fixtures finish immediately; timers advance only when no fetch is
  # pending. Drain cancel events before selecting a timer, as the host does.
  for _ in range(150):
   while True:
    raw=self.text('mbjs_take_event')
    if raw is None:break
    event=json.loads(raw)
    if event['kind']=='cancel':self.events.pop(event['request'],None)
    else:
     if event['kind']=='timer':event['due']=self.clock+event['delay']
     self.events[event['id']]=event
   if status<0:raise RuntimeError(self.text('mbjs_result'))
   if status==1:return json.loads(self.text('mbjs_result'))
   fetches=[e for e in self.events.values() if e['kind']=='fetch']
   if fetches:event=fetches[0];value=self.response(event)
   else:
    timers=[e for e in self.events.values() if e['kind']=='timer']
    if not timers:raise RuntimeError('Pending call without a host event')
    event=min(timers,key=lambda e:e['due']);self.clock=event['due'];value=None
   self.events.pop(event['id'])
   status=self.lib.mbjs_settle(self.pointer,event['id'],1,json.dumps(value,ensure_ascii=False).encode(),100)
  raise RuntimeError('Too many events')
 def call(self,name,args=None):return self.finish(self.lib.mbjs_start(self.pointer,name.encode(),json.dumps(args or {},ensure_ascii=False).encode(),100))
 def close(self):self.lib.mbjs_destroy(self.pointer)
for platform in ['ios','android']:
 r=Runtime(platform)
 try:
  one=r.call('search',{'query':'音乐','kind':'tracks','offset':0});two=r.call('search',{'query':'音乐','kind':'tracks','offset':30})
  assert one['tracks'][0]['id']=='1' and two['tracks'][0]['id']=='31'
  assert one['tracks'][0]['duration']==123000 and one['more']
  result=r.call('lyrics',{'id':'1'});assert result['lrc']==lyric
  audio=r.call('stream',{'id':'1','quality':'standard'});assert audio['type']=='mp3' and audio['url'].endswith('fixture.mp3')
  profile=r.call('signIn');assert profile['id']=='12345' and any(p.get('qr') for p in r.prompts)
  device=r.storage['devid']
  count=len(r.requests);r.call('signOut');assert r.call('account') is None and len(r.requests)==count
  assert r.storage['session']['uid']==profile['id']
  r.call('search',{'query':'匿名','kind':'tracks'});assert 'token' not in r.requests[-1]['headers'] and 'token=' not in r.requests[-1]['url']
  prompts=len(r.prompts);assert r.call('signIn')['id']==profile['id'] and len(r.prompts)==prompts
  assert r.storage['devid']==device
  print('PASS',platform,'native QuickJS: search/paging/UTF-8/audio/QR/retained-session validation/device ID')
 finally:r.close()
