export function cutTriangles(triangles, planes) {
  let polys = triangles;
  for (const plane of planes) {
    const next = [];
    for (const poly of polys) {
      const ds = poly.map(plane);
      if (Math.min(...ds) >= -1e-7 || Math.max(...ds) <= 1e-7) { next.push(poly); continue; }
      for (const side of [-1, 1]) {
        const out = [];
        poly.forEach((a, i) => {
          const j = (i + 1) % poly.length, b = poly[j], da = ds[i] * side, db = ds[j] * side;
          if (da >= -1e-7) out.push(a);
          if ((da > 1e-7 && db < -1e-7) || (da < -1e-7 && db > 1e-7)) {
            const t = da / (da - db); out.push(a.map((v, k) => v + t * (b[k] - v)));
          }
        });
        if (out.length >= 3) next.push(out);
      }
    }
    polys = next;
  }
  return polys.flatMap(p => p.slice(1,-1).flatMap((_,i) => [p[0],p[i+1],p[i+2]]));
}
export const thickness=2, radius=2, k=.273;
export const wingAllowance = Math.PI/2*(radius+k*thickness);
export const lipAllowance = Math.PI/4*(radius+k*thickness);
export function section(s,z,a,width) {
  if(a<1e-7 || s<=0)return [s,z];
  const neutral=thickness*(1-k),r=width/a,phi=Math.min(s/width,1)*a,rr=r+neutral-z,tail=Math.max(0,s-width);
  return [rr*Math.sin(phi)+tail*Math.cos(phi),neutral+r-rr*Math.cos(phi)+tail*Math.sin(phi)];
}
export function makeBender(data) {
  const [o,end]=data.lipLine, dx=end[0]-o[0],dy=end[1]-o[1],len=Math.hypot(dx,dy),normal=[-dy/len,dx/len];
  const distance=p=>(p[0]-o[0])*normal[0]+(p[1]-o[1])*normal[1];
  const planes=[];
  for(let i=0;i<=18;i++) {
    planes.push(p=>p[0]-(data.left-wingAllowance/2+i*wingAllowance/18));
    planes.push(p=>p[0]-(data.right-wingAllowance/2+i*wingAllowance/18));
    planes.push(p=>distance(p)-(-lipAllowance/2+i*lipAllowance/18));
  }
  const leftStart=data.left+wingAllowance/2,rightStart=data.right-wingAllowance/2;
  function deform(p,left,right,lip) {
    let [x,y,z]=p;
    // The short return belongs to the left wing: fold it first in local
    // sheet coordinates, then carry it with the 90-degree parent bend.
    const s=distance(p)+lipAllowance/2;
    if(s>0) {
      const [along,w]=section(s,thickness-z,lip,lipAllowance);
      x+=normal[0]*(along-s);y+=normal[1]*(along-s);z=thickness-w;
    }
    if(x<leftStart){const [s,w]=section(leftStart-x,z,left,wingAllowance);return [leftStart-s,y,w];}
    if(x>rightStart){const [s,w]=section(x-rightStart,z,right,wingAllowance);return [rightStart+s,y,w];}
    return [x,y,z];
  }
  return {planes,deform};
}
export function stage(t) {
  const c=x=>Math.max(0,Math.min(1,x));
  return {left:c(t/.3)*Math.PI/2,right:c((t-.3)/.3)*Math.PI/2,lip:c((t-.6)/.22)*Math.PI/4,support:c((t-.82)/.18)};
}
