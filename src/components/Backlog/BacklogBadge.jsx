export default function BacklogBadge({ size = 15 }) {
  return (
    <span
      title="Backlog"
      style={{
        display:         'inline-flex',
        alignItems:      'center',
        justifyContent:  'center',
        width:           size,
        height:          size,
        borderRadius:    3,
        background:      '#4DAE00',
        color:           '#fff',
        fontSize:        Math.round(size * 0.6),
        fontWeight:      700,
        lineHeight:      1,
        flexShrink:      0,
        letterSpacing:   0,
        verticalAlign:   'middle',
        marginRight:     4,
      }}
    >B</span>
  )
}
