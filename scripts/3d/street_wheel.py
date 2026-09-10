"""Parametric Evolve GTR 97 mm street wheel. Dimensions in metres, axle along Y."""
import math
import bpy
from mathutils import Vector
from mathutils.geometry import tessellate_polygon

SPEC = {
    "radius": 0.0485, "width": 0.052, "edge_radius": 0.0018,
    "face_recess": 0.0015, "core_radius": 0.022,
    "core_depth": 0.008, "bearing_radius": 0.0124, "axle_radius": 0.0095,
    "bar_count": 3, "bar_width": 0.0072, "bar_height": 0.021,
    "bar_gap": 0.0065, "bar_offset": 0.035,
    "text_size": 0.0064, "text_offset": -0.034,
    "urethane_rgb": (0.8, 0.12, 0.022), "urethane_roughness": 0.4,
    "print_rgb": (0.004, 0.004, 0.004),
}

def _material(name, rgb, rough, metal=0.0, coat=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Coat Weight'].default_value = coat
    return mat

def materials():
    return {
        'urethane': _material('StreetUrethane', SPEC['urethane_rgb'], SPEC['urethane_roughness'], coat=0.12),
        'core': _material('StreetCore', (0.0015,0.0018,0.002), 0.28, coat=0.12),
        'bearing': _material('StreetBearing', (0.16,0.17,0.18), 0.29, 0.75),
        'print': _material('StreetPrint', SPEC['print_rgb'], 0.63),
    }

def _mesh(name, verts, faces, mat, smooth=False):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for p in mesh.polygons: p.use_smooth = smooth
    return obj

def _lathe(name, profile, loc, mat, n=160):
    # Closed radial/axial section, revolved around the axle. No filled end caps.
    verts = [(loc[0]+r*math.cos(2*math.pi*i/n),loc[1]+d,loc[2]+r*math.sin(2*math.pi*i/n)) for r,d in profile for i in range(n)]
    faces=[]
    for j in range(len(profile)):
        for i in range(n):
            a=j*n+i; b=j*n+(i+1)%n; c=((j+1)%len(profile))*n+(i+1)%n; d=((j+1)%len(profile))*n+i
            faces.append((a,b,c,d))
    obj=_mesh(name, verts, faces, mat, True)
    split=obj.modifiers.new('Crisp moulded transitions','EDGE_SPLIT')
    split.split_angle=math.radians(38)
    return obj

def _ring(name, ri, ro, near, far, loc, mat):
    near,far=max(near,far),min(near,far)
    e=min(0.00018,(ro-ri)*0.22,(near-far)*0.1)
    return _lathe(name, [(ri+e,near),(ro-e,near),(ro,near-e),(ro,far+e),(ro-e,far),(ri+e,far),(ri,far+e),(ri,near-e)],loc,mat)

def _face_depth(r):
    s=SPEC; h=s['width']/2; e=s['edge_radius']; R=s['radius']
    if r>R-e:
        return h-e+math.sqrt(max(0,e*e-(r-(R-e))**2))
    if r>=0.030: return h
    if r>=0.025: return h-0.0009*(0.030-r)/0.005
    return h-0.0009-(s['face_recess']-0.0009)*min(1,(0.025-r)/(0.025-s['core_radius']))

def _print_patch(name, coords, loc, side, mat):
    # Tessellate and project each small triangle, so ink never cuts through the dish.
    points=[Vector((u,v,0)) for u,v in coords]
    tris=tessellate_polygon([points])
    if tris and isinstance(tris[0][0], int): tris=[tuple(points[i] for i in tri) for tri in tris]
    vs=[]; faces=[]
    def add_tri(a,b,c,level=0):
        if max((a-b).length,(b-c).length,(c-a).length)>0.004 and level<4:  # ponytail: 4mm patches keep the GLB small; 1.5mm was 5MB of stripes
            ab=(a+b)/2; bc=(b+c)/2; ca=(c+a)/2
            for t in [(a,ab,ca),(ab,b,bc),(ca,bc,c),(ab,bc,ca)]: add_tri(*t,level+1)
            return
        start=len(vs)
        for p in (a,b,c):
            u,v=p.x,p.y
            vs.append((loc[0]-side*u,loc[1]+side*(_face_depth(math.hypot(u,v))+0.000085),loc[2]+v))
        faces.append((start,start+1,start+2))
    for a,b,c in tris: add_tri(a,b,c)
    return _mesh(name,vs,faces,mat)

def _arc(name, r, start, end, loc, side, mat, thickness=0.00022):
    coords=[]
    N=70
    for i in range(N+1):
        a=math.radians(start+(end-start)*i/N)
        coords.append(((r-thickness/2)*math.cos(a),(r-thickness/2)*math.sin(a)))
    for i in range(N,-1,-1):
        a=math.radians(start+(end-start)*i/N)
        coords.append(((r+thickness/2)*math.cos(a),(r+thickness/2)*math.sin(a)))
    return _print_patch(name,coords,loc,side,mat)

def _text(name, body, size, u, v, loc, mat, side, wide=1.0, shear=0.0):
    bpy.ops.object.text_add(location=(loc[0]-side*u,loc[1]+side*(_face_depth(math.hypot(u,v))+0.00007),loc[2]+v))
    obj=bpy.context.object; obj.name=name
    obj.data.body=body; obj.data.size=size
    obj.data.align_x='CENTER'; obj.data.align_y='CENTER'
    obj.data.extrude=0; obj.data.shear=shear
    obj.data.offset=size*(0.024 if body in ('evolve','97','76A','USA') else 0.008)
    obj.rotation_euler=(math.pi/2,0,math.pi if side>0 else 0)
    obj.scale.x=wide
    bpy.ops.object.convert(target='MESH')
    obj=bpy.context.object; obj.data.materials.append(mat)
    return obj

def build(x,y,z,tag,mats=None,outward=1):
    s=SPEC; m=mats or materials(); loc=(x,y,z); objs=[]
    R=s['radius']; h=s['width']/2; e=s['edge_radius']; C=s['core_radius']
    # Straight cylindrical running surface, softly radiused lips and shallow dished faces.
    front=[(C,h-s['face_recess']),(0.025,h-0.0009),(0.030,h),(R-e,h)]
    for i in range(1,13):
        t=math.pi/2*i/12
        front.append((R-e+e*math.sin(t),h-e+e*math.cos(t)))
    profile=front+[(r,-d) for r,d in reversed(front)]
    objs.append(_lathe('Street_'+tag,profile,loc,m['urethane']))
    # Structural outer core liner and hollow bearing barrel.
    objs.append(_ring('CoreOuter_'+tag,C-0.0014,C+0.0001,-h+0.002,h-0.002,loc,m['core']))
    objs.append(_ring('AxleBarrel_'+tag,s['axle_radius'],s['bearing_radius'],-h+0.006,h-0.006,loc,m['core']))
    for side in (1,-1):
        face=side*(h-0.0021)
        objs.append(_lathe('CoreLip_'+tag+str(side),[(C-0.0014,face-side*0.002),(C-0.0014,face),(C-0.0008,face+side*0.00035),(C,face),(C,face-side*0.002)],loc,m['core']))
        near=side*(h-0.006)
        objs.append(_ring('BearingRim_'+tag+str(side),s['axle_radius'],s['axle_radius']+0.00065,near,near-side*0.003,loc,m['bearing']))
        objs.append(_ring('BearingSeat_'+tag+str(side),s['axle_radius']+0.0007,s['bearing_radius'],near-side*0.0002,near-side*0.002,loc,m['core']))
    # Six deep radial webs with actual open windows, rather than a solid black disk.
    for k in range(6):
        a=2*math.pi*k/6+0.18
        verts=[]
        for dep in (-h+0.008,h-0.008):
            for rad,ang in [(s['bearing_radius']-0.0002,a-0.18),(C-0.0007,a-0.12),(C-0.0007,a+0.12),(s['bearing_radius']-0.0002,a+0.18)]:
                verts.append((x+rad*math.cos(ang),y+dep,z+rad*math.sin(ang)))
        web=_mesh('CoreWeb_'+tag+str(k),verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],m['core'])
        bevel=web.modifiers.new('Moulded web edges','BEVEL'); bevel.width=0.0007; bevel.segments=3
        web.modifiers.new('Web normals','WEIGHTED_NORMAL')
        objs.append(web)
    # Screen-printed graphics following the face, with three curved-ended stripes.
    for i in range(s['bar_count']):
        u=(i-1)*(s['bar_width']+s['bar_gap']); w=s['bar_width']/2
        coords=[]
        for j in range(13):
            xx=u-w+2*w*j/12
            coords.append((xx,math.sqrt(0.0465**2-xx**2)))
        inner=0.0285 if i==1 else 0.027
        for j in range(12,-1,-1):
            xx=u-w+2*w*j/12
            coords.append((xx,math.sqrt(inner**2-xx**2)))
        objs.append(_print_patch('Stripe_'+tag+str(i),coords,loc,outward,m['print']))
    for r in (0.0338,0.0356):
        for a,b in [(26,56),(124,158),(190,246),(294,346)]:
            objs.append(_arc('PrintArc_'+tag+str((r,a)),r,a,b,loc,outward,m['print']))
    objs.append(_text('Brand_'+tag,'evolve',s['text_size'],0,s['text_offset'],loc,m['print'],outward,wide=1.32,shear=0.12))
    objs.append(_text('Sub_'+tag,'SKATEBOARDS',0.00185,0,-0.0381,loc,m['print'],outward,wide=1.1))
    for body,size,u,v in [('97',0.0067,0.033,0.007),('mm',0.0029,0.033,0.0029),('76A',0.0048,0.033,-0.0031),('GT',0.003,-0.032,0.005),('MADE IN',0.00165,-0.032,-0.0024),('USA',0.0028,-0.032,-0.0051)]:
        objs.append(_text('Label_'+tag+body,body,size,u,v,loc,m['print'],outward,shear=0.14))
    # Thin hexagonal GT emblem.
    u=-0.032; v=0.005
    outer=[(u+0.0044*math.cos(math.radians(30+60*j)),v+0.0044*math.sin(math.radians(30+60*j))) for j in range(6)]
    inner=[(u+0.00405*math.cos(math.radians(30+60*j)),v+0.00405*math.sin(math.radians(30+60*j))) for j in range(6)]
    for j in range(6): objs.append(_print_patch('GTBadge_'+tag+str(j),[outer[j],outer[(j+1)%6],inner[(j+1)%6],inner[j]],loc,outward,m['print']))
    return objs
