"""Parametric Evolve GTR Bamboo AT. X length, Y axles, metres."""
import math
import bpy
from mathutils import Vector
SPEC = {"half_len":0.49,"half_w":0.125,"thick":0.012,"truck_x":0.43,"truck_z":-0.067,"hanger_len":0.30,"axle_len":0.42,"motor_x":-0.48,"motor_y":0.10,"motor_radius":0.030,"motor_len":0.072}
MATERIAL_KEYS=("bamboo","grip","black","gloss","alu","steel","orange")

def _smooth():
    for p in bpy.context.object.data.polygons: p.use_smooth=True

def _box(name,size,loc,mat,parent,bevel=0.0,segments=3,rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc,rotation=rot)
    o=bpy.context.object; o.name=name; o.scale=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        m=o.modifiers.new('Edge radii','BEVEL'); m.width=bevel; m.segments=segments
        o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    o.data.materials.append(mat); o.parent=parent
    return o

def _cyl(name,radius,depth,loc,mat,parent,axis='Y',verts=24):  # ponytail: 24 sides is smooth at card size and a third of the vertices
    rot={'Y':(math.pi/2,0,0),'Z':(0,0,0),'X':(0,math.pi/2,0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts,radius=radius,depth=depth,location=loc,rotation=rot)
    o=bpy.context.object; o.name=name; o.data.materials.append(mat); o.parent=parent
    m=o.modifiers.new('Machined edges','BEVEL'); m.width=.0007; m.segments=2
    o.modifiers.new('Normals','WEIGHTED_NORMAL')
    return o

def _torus(name,major,minor,loc,mat,parent):
    bpy.ops.mesh.primitive_torus_add(major_radius=major,minor_radius=minor,major_segments=36,minor_segments=8,location=loc,rotation=(math.pi/2,0,0))
    o=bpy.context.object; o.name=name; o.data.materials.append(mat); o.parent=parent; _smooth(); return o

def material(name,color,rough=.5,metal=0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(*color,1); bs.inputs['Roughness'].default_value=rough; bs.inputs['Metallic'].default_value=metal
    return m

def width(x):
    a=abs(x)
    knots=[(0,.118),(.24,.124),(.30,.123),(.33,.112),(.36,.078),(.39,.057),(.46,.055),(.48,.044),(.49,.018)]
    for (x0,w0),(x1,w1) in zip(knots,knots[1:]):
        if a<=x1:
            t=max(0,(a-x0)/(x1-x0)); t=t*t*(3-2*t); return w0+(w1-w0)*t
    return .018

def height(x,y):
    a=abs(x); t=max(0,min(1,(a-.32)/.065)); t=t*t*(3-2*t)
    return .006*(y/.125)**2-.009*t

def deck_shape(x,y):
    yy=y/.125*width(x); return yy,height(x,yy)

def surface(name,xmin,xmax,yfun,mat,parent,lift=0,thick=0):
    vs=[]; fs=[]; nx=90; ny=10
    for i in range(nx+1):
        x=xmin+(xmax-xmin)*i/nx
        ya,yb=yfun(x)
        for j in range(ny+1):
            y=ya+(yb-ya)*j/ny; vs.append((x,y,height(x,y)+lift))
    for i in range(nx):
        for j in range(ny):
            a=i*(ny+1)+j; fs.append((a,a+ny+1,a+ny+2,a+1))
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(vs,[],fs); mesh.update()
    o=bpy.data.objects.new(name,mesh); bpy.context.collection.objects.link(o); o.parent=parent; o.data.materials.append(mat)
    if thick:
        m=o.modifiers.new('Laminated thickness','SOLIDIFY'); m.thickness=thick; m.offset=-1
    return o

def text(body,loc,size,mat,parent,rotation=0):
    c=bpy.data.curves.new(body,'FONT'); c.body=body; c.align_x='CENTER'; c.align_y='CENTER'; c.size=size
    o=bpy.data.objects.new(body,c); bpy.context.collection.objects.link(o); o.location=loc; o.rotation_euler[2]=rotation; o.data.materials.append(mat); o.parent=parent
    return o

def tire_shell(x,y,z,mat,parent):
    # Rounded pneumatic casing with shallow alternating diagonal road tread.
    profile=[(0,.096),(.010,.0958),(.020,.094),(.027,.089),(.031,.081),(.032,.071),(.030,.058),(.027,.050),(.022,.043),(-.022,.043),(-.027,.050),(-.030,.058),(-.032,.071),(-.031,.081),(-.027,.089),(-.020,.094),(-.010,.0958)]
    vs=[]; fs=[]; count=180
    for i in range(count):
        a=2*math.pi*i/count
        for dy,r in profile:
            phase=(a/(2*math.pi)*28 + abs(dy)*13)%1
            groove=max(0,1-abs(phase-.5)/.075)*.0018 if r>.083 else 0
            rr=r-groove
            vs.append((x+rr*math.cos(a),y+dy,z+rr*math.sin(a)))
    n=len(profile)
    for i in range(count):
        for j in range(n): fs.append((i*n+j,((i+1)%count)*n+j,((i+1)%count)*n+(j+1)%n,i*n+(j+1)%n))
    me=bpy.data.meshes.new('Pneumatic tire casing'); me.from_pydata(vs,[],fs); me.update()
    ob=bpy.data.objects.new('All terrain treaded tire',me); bpy.context.collection.objects.link(ob); ob.parent=parent; me.materials.append(mat)
    for p in me.polygons: p.use_smooth=True
    for sg in [-1,1]:
        _torus('Raised sidewall bead',.052,.001,(x,y+sg*.029,z),mat,parent)
        _torus('Sidewall molding line',.076,.00065,(x,y+sg*.032,z),mat,parent)

def build(mats,parent=None,wheels_parent=None,battery_parent=None):
    """wheels_parent / battery_parent: animated empties in build-3d.py that own the dockable parts."""
    if parent is None:
        bpy.ops.object.empty_add(); parent=bpy.context.object; parent.name='Board'
    wheels=wheels_parent or parent
    battery=battery_parent or parent
    # Prefer the caller's materials: build-3d.py passes image-textured bamboo and grip that
    # survive glTF export, while the render harness passes flat stand-ins.
    black=mats.get('black') or material('Black anodized CNC',(.018,.022,.026),.34,.55)
    rubber=material('Dark rubber',(.012,.014,.016),.82)
    grip=mats.get('grip') or material('Fine charcoal grip',(.027,.029,.032),.95)
    wood=mats.get('bamboo') or material('Honey bamboo',(.57,.32,.135),.48)
    edge=material('Bamboo ply edges',(.37,.21,.085),.53)
    ink=material('Burned bamboo graphics',(.095,.048,.023),.7)
    steel=mats.get('steel') or material('Dark steel hardware',(.16,.18,.19),.28,.8)
    # Wheel-only materials so the storefront can hide the whole all-terrain set.
    at_tyre=material('ATTyre',(.012,.014,.016),.82)
    at_hub=material('ATHub',(.018,.022,.026),.34,.55)
    at_nut=material('ATNut',(.16,.18,.19),.28,.8)
    # Long, fine bamboo grain and granular grip.
    for mat,scale,strength in [(m,sc,st) for m,sc,st in [(wood,(4,240,32),.14),(grip,(1700,1700,1700),.27)] if m not in mats.values()]:
        n=mat.node_tree.nodes; l=mat.node_tree.links; bs=n.get('Principled BSDF')
        tc=n.new('ShaderNodeTexCoord'); mp=n.new('ShaderNodeVectorMath'); mp.operation='MULTIPLY'; mp.inputs[1].default_value=scale; l.new(tc.outputs['Generated'],mp.inputs[0])
        noise=n.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value=3; l.new(mp.outputs[0],noise.inputs['Vector'])
        bump=n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=strength; bump.inputs['Distance'].default_value=.00025; l.new(noise.outputs['Fac'],bump.inputs['Height']); l.new(bump.outputs[0],bs.inputs['Normal'])
        if mat==wood:
            ramp=n.new('ShaderNodeValToRGB'); ramp.color_ramp.elements[0].color=(.33,.16,.055,1); ramp.color_ramp.elements[1].color=(.72,.46,.23,1); l.new(noise.outputs['Fac'],ramp.inputs[0]); l.new(ramp.outputs[0],bs.inputs['Base Color'])
    surface('Bamboo deck',-.49,.49,lambda x:(-width(x),width(x)),wood,parent,thick=.012)
    for z in [-.003,-.006,-.009]:
        surface('Fine laminated ply',-.49,.49,lambda x:(-width(x)*1.001,width(x)*1.001),edge,parent,lift=z,thick=.00055)
    for sign in [-1,1]:
        def bounds(x,sg=sign):
            outer=width(x)-.004; inner=.051+.009*(abs(x)/.335)**6
            return (inner,outer) if sg>0 else (-outer,-inner)
        surface('Split grip tape',-.335,.335,bounds,grip,parent,lift=.001,thick=.0008)
    for a,b in [(-.385,-.31),(-.24,-.047),(.047,.24),(.31,.385)]:
        surface('Centre pinstripe',a,b,lambda x:(-.0018,.0018),black,parent,lift=.0008)
    # Central printed roundel.
    vs=[]; fs=[]
    for i in range(96):
        t=i*2*math.pi/96
        for r in [.034,.037]: vs.append((r*math.cos(t),r*math.sin(t),.0013))
    for i in range(96): fs.append((2*i,2*((i+1)%96),2*((i+1)%96)+1,2*i+1))
    me=bpy.data.meshes.new('Roundel'); me.from_pydata(vs,[],fs); ob=bpy.data.objects.new('Evolve roundel',me); bpy.context.collection.objects.link(ob); ob.data.materials.append(ink); ob.parent=parent
    text('E',(0,0,.0018),.048,ink,parent,math.pi/2)
    for x in [-.276,.276]:
        text('GTR',(x,0,.001),.028,ink,parent,math.pi/2)
        text('B A M B O O',(x-.02,0,.001),.008,ink,parent,math.pi/2)
    # Shallow full-length flex enclosure, segmented transverse seams.
    _box('Battery flange',(.704,.219,.009),(0,0,-.017),rubber,battery,.019)
    divisions=[-.344,-.245,-.157,-.069,.019,.107,.195,.344]
    for a,b in zip(divisions,divisions[1:]):
        _box('Segmented flex battery',((b-a)-.002,.204,.034),((a+b)/2,0,-.035),black,battery,.006)
    _box('ESC fin panel',(.10,.135,.004),(-.274,0,-.054),black,battery,.006)
    for x in range(12): _box('Cooling rib',(.003,.125,.003),(-.316+x*.0075,0,-.057),black,battery,.001)
    _cyl('Power button',.008,.003,(.21,-.104,-.033),steel,battery)
    tz=SPEC['truck_z']
    for tag,x in [('Front',SPEC['truck_x']),('Rear',-SPEC['truck_x'])]:
        _box('Drop through '+tag,(.080,.069,.006),(x,0,-.005),black,parent,.007)
        for bx in [-.029,.029]:
            for by in [-.025,.025]:
                _cyl('Deck mounting washer',.005,.0015,(x+bx,by,-.001),black,parent,'Z')
                _cyl('Hex mounting screw',.0023,.0017,(x+bx,by,0),steel,parent,'Z',6)
        for dx,z in [(0,-.023),(-math.copysign(.020,x),-.047)]:
            _cyl('Double kingpin bushing',.014,.016,(x+dx,0,z),rubber,parent,'Z')
            _cyl('Kingpin washer',.017,.003,(x+dx,0,z-.009),black,parent,'Z')
            _cyl('Kingpin nut',.008,.007,(x+dx,0,z-.014),steel,parent,'Z',6)
        _box('CNC hanger',(.022,.315,.022),(x,0,tz),black,parent,.004)
        _box('Truck pivot',(.046,.059,.028),(x,0,tz+.014),black,parent,.008)
        _cyl('Axle',.005,.42,(x,0,tz),steel,parent)
        # Detailed wheel hubs fill the open centres of the supplied tire meshes.
        for sg in [-1,1]:
            y=sg*.185
            tire_shell(x,y,tz,at_tyre,wheels)
            _torus('Hub barrel',.044,.004,(x,y,tz),at_hub,wheels)
            _cyl('Hub spindle',.011,.042,(x,y,tz),at_hub,wheels,verts=32)
            for yy in [y-sg*.026,y+sg*.026]:
                _torus('Rim bead',.047,.003,(x,yy,tz),at_hub,wheels)
                _cyl('Axle boss',.012,.006,(x,yy,tz),at_hub,wheels)
                for i in range(7):
                    a=i*2*math.pi/7
                    _box('Seven spoke hub',(.036,.006,.008),(x+.027*math.cos(a),yy,tz+.027*math.sin(a)),at_hub,wheels,.002,rot=(0,-a,0))
                    _cyl('Rim screw',.002,.007,(x+.041*math.cos(a),yy,tz+.041*math.sin(a)),at_nut,wheels,verts=12)
            _cyl('Axle nut',.0065,.008,(x,y+sg*.033,tz),at_nut,wheels,verts=6)
    for sg in [-1,1]:
        y=sg*.099; mx=-.484
        _cyl('Brushless motor',.030,.074,(mx,y,tz),black,parent,verts=40)
        for dy in [-.037,.037]: _cyl('Motor endcap',.031,.004,(mx,y+dy,tz),black,parent)
        yy=sg*.144
        _box('Motor mount arm',(.100,.009,.037),(-.452,yy,tz),black,parent,.01)
        _cyl('Wheel belt pulley',.042,.013,(-.43,sg*.15,tz),black,parent)
        _cyl('Drive pulley',.014,.014,(mx,sg*.15,tz),black,parent)
        _box('Upper drive belt',(.067,.012,.004),(-.457,sg*.152,tz+.026),rubber,parent,.002,rot=(0,-.43,0))
        _box('Lower drive belt',(.067,.012,.004),(-.457,sg*.152,tz-.026),rubber,parent,.002,rot=(0,.43,0))
    return parent
